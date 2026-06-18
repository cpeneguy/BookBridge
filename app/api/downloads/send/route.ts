import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendToQbittorrent } from "@/lib/integrations/qbittorrent";
import { sendToSabnzbd } from "@/lib/integrations/sabnzbd";
import { getSettings } from "@/lib/settings";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const bookId = String(body.bookId ?? "");
  const format = String(body.format ?? "audiobook");

  const book = await prisma.book.findUnique({ where: { id: bookId } });
  if (!book) return NextResponse.json({ error: "Book not found." }, { status: 404 });
  const release = body.releaseId ? await prisma.release.findUnique({ where: { id: String(body.releaseId) } }) : null;
  if (!release) return NextResponse.json({ error: "Release not found." }, { status: 404 });

  const inferredClient = clientForProtocol(release.protocol);
  if (!inferredClient) return NextResponse.json({ error: `No downloader is mapped for ${release.protocol}.` }, { status: 400 });

  const settings = await getSettings();
  const category = String(
    body.category ??
      (inferredClient === "sabnzbd"
        ? format === "ebook"
          ? settings.sabEbookCategory
          : settings.sabAudiobookCategory
        : format === "ebook"
          ? settings.qbittorrentEbookCategory
          : settings.qbittorrentAudiobookCategory)
  );
  const existingReleaseDownload = await prisma.download.findFirst({
    where: {
      releaseId: release.id,
      client: inferredClient,
      category,
      status: { not: "failed" }
    },
    orderBy: { updatedAt: "desc" }
  });

  if (existingReleaseDownload) {
    return NextResponse.json({ download: existingReleaseDownload, duplicate: true, message: "This release is already tracked." });
  }

  const activeDownload = await prisma.download.findFirst({
    where: {
      bookId,
      client: inferredClient,
      category,
      status: { in: ["queued", "downloading"] }
    },
    orderBy: { updatedAt: "desc" }
  });

  if (activeDownload) {
    return NextResponse.json({ download: activeDownload, duplicate: true, message: "A download is already queued for this book and category." });
  }

  try {
    const result =
      inferredClient === "sabnzbd"
        ? await sendToSabnzbd({ settings, downloadUrl: release.downloadUrl, category })
        : await sendToQbittorrent({
            settings,
            downloadUrl: release.downloadUrl,
            category,
            savePath: `${settings.downloadsPath}/torrents/${category}`
          });

    if (result.jobId) {
      const existingByJob = await prisma.download.findFirst({
        where: {
          client: inferredClient,
          clientJobId: result.jobId
        },
        orderBy: { updatedAt: "desc" }
      });

      if (existingByJob) {
        return NextResponse.json({ download: existingByJob, duplicate: true, message: "This client job is already tracked." });
      }
    }

    const download = await prisma.download.create({
      data: {
        bookId,
        releaseId: release.id,
        client: inferredClient,
        clientJobId: result.jobId,
        title: release.title,
        category,
        status: "queued",
        progress: 0
      }
    });

    await prisma.book.update({ where: { id: bookId }, data: { status: "downloading" } });

    return NextResponse.json({ download });
  } catch (error) {
    const download = await prisma.download.create({
      data: {
        bookId,
        releaseId: release.id,
        client: inferredClient,
        clientJobId: null,
        title: release.title,
        category,
        status: "failed",
        errorMessage: error instanceof Error ? error.message : "Download send failed."
      }
    });

    return NextResponse.json({ download, error: download.errorMessage }, { status: 500 });
  }
}

function clientForProtocol(protocol: string) {
  const normalized = protocol.toLowerCase();
  if (normalized === "usenet") return "sabnzbd";
  if (normalized === "torrent") return "qbittorrent";
  return null;
}
