import { NextRequest, NextResponse } from "next/server";
import { json } from "@/lib/api-response";
import { sendToQbittorrent } from "@/lib/integrations/qbittorrent";
import { searchProwlarrReleases, type NormalizedRelease } from "@/lib/integrations/prowlarr";
import { sendToSabnzbd } from "@/lib/integrations/sabnzbd";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";

type RequestFormat = "ebook" | "audiobook";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const format = String(body.format ?? "") as RequestFormat;

  if (!["ebook", "audiobook"].includes(format)) {
    return NextResponse.json({ error: "format must be ebook or audiobook." }, { status: 400 });
  }

  const title = String(body.title ?? "").trim();
  const author = String(body.author ?? "").trim();

  if (!title || !author) {
    return NextResponse.json({ error: "Title and author are required." }, { status: 400 });
  }

  const settings = await getSettings();
  const book = await upsertWantedBook(body, format);

  try {
    await prisma.book.update({
      where: { id: book.id },
      data: {
        lastReleaseSearchAt: new Date(),
        lastReleaseSearchFormat: format,
        lastReleaseSearchStatus: "searching",
        lastReleaseSearchMessage: "Searching Prowlarr"
      }
    });

    const results = await searchProwlarrReleases({ settings, book, format });
    const releases = await replaceReleases(book.id, format, results);

    const autoThreshold = Number(settings.autoRequestThreshold ?? 85);
    const reviewThreshold = Number(settings.manualReviewThreshold ?? 70);
    const selected = selectAutoRelease(releases, settings, autoThreshold, reviewThreshold);

    if (!selected) {
      await logRequestEvent("warn", "No eligible release selected", {
        bookId: book.id,
        title: book.title,
        format,
        releaseCount: releases.length,
        autoThreshold,
        reviewThreshold
      });
      await prisma.book.update({
        where: { id: book.id },
        data: {
          lastReleaseSearchAt: new Date(),
          lastReleaseSearchFormat: format,
          lastReleaseSearchStatus: "review",
          lastReleaseSearchMessage: `${releases.length} releases found. Review required.`
        }
      });

      return json({
        action: "review",
        book,
        releases,
        message: releases.length ? "Review releases before download." : "No releases found."
      });
    }

    const category = selected.client === "sabnzbd"
      ? format === "ebook"
        ? settings.sabEbookCategory
        : settings.sabAudiobookCategory
      : format === "ebook"
        ? settings.qbittorrentEbookCategory
        : settings.qbittorrentAudiobookCategory;

    const existingReleaseDownload = await prisma.download.findFirst({
      where: {
        releaseId: selected.release.id,
        client: selected.client,
        category,
        status: { not: "failed" }
      },
      orderBy: { updatedAt: "desc" }
    });

    if (existingReleaseDownload) {
      await logRequestEvent("info", "Existing release download reused", {
        bookId: book.id,
        releaseId: selected.release.id,
        client: selected.client,
        category,
        format
      });
      await prisma.book.update({
        where: { id: book.id },
        data: {
          status: "downloading",
          lastReleaseSearchAt: new Date(),
          lastReleaseSearchFormat: format,
          lastReleaseSearchStatus: "completed",
          lastReleaseSearchMessage: "Existing release download reused."
        }
      });

      return json({
        action: "downloaded",
        book,
        download: existingReleaseDownload,
        release: selected.release,
        message: `Already tracking ${format} release.`
      });
    }

    const activeDownload = await prisma.download.findFirst({
      where: {
        bookId: book.id,
        client: selected.client,
        category,
        status: { in: ["queued", "downloading"] }
      },
      orderBy: { updatedAt: "desc" }
    });

    if (activeDownload) {
      await logRequestEvent("info", "Existing active download reused", {
        bookId: book.id,
        releaseId: selected.release.id,
        client: selected.client,
        category,
        format
      });
      await prisma.book.update({
        where: { id: book.id },
        data: {
          status: "downloading",
          lastReleaseSearchAt: new Date(),
          lastReleaseSearchFormat: format,
          lastReleaseSearchStatus: "completed",
          lastReleaseSearchMessage: "Existing active download reused."
        }
      });

      return json({
        action: "downloaded",
        book,
        download: activeDownload,
        release: selected.release,
        message: `Already queued ${format} download.`
      });
    }

    const result = selected.client === "sabnzbd"
      ? await sendToSabnzbd({ settings, downloadUrl: selected.release.downloadUrl, category })
      : await sendToQbittorrent({
          settings,
          downloadUrl: selected.release.downloadUrl,
          category,
          savePath: `${settings.downloadsPath}/torrents/${category}`
        });

    if (result.jobId) {
      const existingByJob = await prisma.download.findFirst({
        where: {
          client: selected.client,
          clientJobId: result.jobId
        },
        orderBy: { updatedAt: "desc" }
      });

      if (existingByJob) {
        return json({
          action: "downloaded",
          book,
          download: existingByJob,
          release: selected.release,
          message: `Already tracking ${format} download.`
        });
      }
    }

    const download = await prisma.download.create({
      data: {
        bookId: book.id,
        releaseId: selected.release.id,
        client: selected.client,
        clientJobId: result.jobId,
        title: selected.release.title,
        category,
        status: "queued",
        progress: 0
      }
    });

    await prisma.book.update({
      where: { id: book.id },
      data: {
        status: "downloading",
        lastReleaseSearchAt: new Date(),
        lastReleaseSearchFormat: format,
        lastReleaseSearchStatus: "completed",
        lastReleaseSearchMessage: `Auto-sent ${selected.release.title}`
      }
    });

    await logRequestEvent("info", "Auto-sent release to downloader", {
      bookId: book.id,
      releaseId: selected.release.id,
      releaseTitle: selected.release.title,
      protocol: selected.release.protocol,
      client: selected.client,
      category,
      score: selected.release.score,
      format
    });

    return json({
      action: "downloaded",
      book,
      download,
      release: selected.release,
      message: `Queued best ${format} match.`
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed.";
    await logRequestEvent("error", message, { bookId: book.id, title: book.title, format });
    await prisma.book.update({
      where: { id: book.id },
      data: {
        lastReleaseSearchAt: new Date(),
        lastReleaseSearchFormat: format,
        lastReleaseSearchStatus: "failed",
        lastReleaseSearchMessage: message
      }
    });

    return NextResponse.json({ action: "failed", book, error: message }, { status: 500 });
  }
}

async function logRequestEvent(level: "info" | "warn" | "error", message: string, detail: Record<string, unknown>) {
  try {
    await prisma.appLog.create({
      data: {
        level,
        source: "request",
        message,
        detail: JSON.stringify(detail, null, 2)
      }
    });
  } catch {
    // Logging should never block request handling.
  }
}

async function upsertWantedBook(body: Record<string, unknown>, format: RequestFormat) {
  const title = String(body.title ?? "").trim();
  const author = String(body.author ?? "").trim();
  const year = body.year ? Number(body.year) : null;

  const existing = await prisma.book.findFirst({
    where: { title, author, year, formatWanted: format }
  });

  if (existing) return existing;

  return prisma.book.create({
    data: {
      title,
      sortTitle: title.toLowerCase().replace(/^the\s+/, ""),
      author,
      year,
      isbn: body.isbn ? String(body.isbn) : null,
      description: body.description ? String(body.description) : null,
      coverUrl: body.coverUrl ? String(body.coverUrl) : null,
      metadataSource: body.metadataSource ? String(body.metadataSource) : null,
      formatWanted: format,
      status: "wanted"
    }
  });
}

async function replaceReleases(bookId: string, format: RequestFormat, results: NormalizedRelease[]) {
  await prisma.release.deleteMany({ where: { bookId, format } });

  return Promise.all(
    results
      .filter((release) => release.downloadUrl)
      .slice(0, 50)
      .map((release) =>
        prisma.release.create({
          data: {
            bookId,
            title: release.title,
            indexer: release.indexer,
            protocol: release.protocol,
            downloadUrl: release.downloadUrl,
            guid: release.guid,
            size: release.size,
            age: release.age,
            seeders: release.seeders,
            category: release.category,
            format: release.format,
            score: release.score,
            warnings: release.warnings.join(", ")
          }
        })
      )
  );
}

function selectAutoRelease(
  releases: Awaited<ReturnType<typeof replaceReleases>>,
  settings: Record<string, string>,
  autoThreshold: number,
  reviewThreshold: number
) {
  const candidates = releases
    .filter((release) => (release.score ?? 0) >= reviewThreshold)
    .map((release) => {
      const client = preferredClientForRelease(release.protocol, settings);
      return client ? { release, client } : null;
    })
    .filter(Boolean) as Array<{ release: (typeof releases)[number]; client: "sabnzbd" | "qbittorrent" }>;

  const sorted = candidates.sort((a, b) => {
    const scoreDelta = (b.release.score ?? 0) - (a.release.score ?? 0);
    if (scoreDelta !== 0) return scoreDelta;
    return protocolRank(b.release.protocol, b.client) - protocolRank(a.release.protocol, a.client);
  });

  return sorted.find((candidate) => (candidate.release.score ?? 0) >= autoThreshold) ?? sorted[0] ?? null;
}

function preferredClientForRelease(protocol: string, settings: Record<string, string>) {
  const normalized = protocol.toLowerCase();
  if (normalized === "usenet" && settings.sabEnabled === "true" && settings.sabUrl && settings.sabApiKey) return "sabnzbd";
  if (normalized === "torrent" && settings.qbittorrentEnabled === "true" && settings.qbittorrentUrl && settings.qbittorrentUsername) return "qbittorrent";
  return null;
}

function protocolRank(protocol: string, client: string) {
  if (protocol === "usenet" && client === "sabnzbd") return 2;
  if (protocol === "torrent" && client === "qbittorrent") return 1;
  return 0;
}
