import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchQbittorrentStatus } from "@/lib/integrations/qbittorrent";
import { fetchSabnzbdStatus } from "@/lib/integrations/sabnzbd";
import { getSettings } from "@/lib/settings";

type ClientStatus = {
  client: string;
  id: string;
  title: string;
  status: string;
  progress?: number;
  path?: string;
  error?: string;
};

export async function POST() {
  const settings = await getSettings();
  const [sab, qbit] = await Promise.allSettled([fetchSabnzbdStatus(settings), fetchQbittorrentStatus(settings)]);
  const availableClients = new Set<string>();
  if (sab.status === "fulfilled") availableClients.add("sabnzbd");
  if (qbit.status === "fulfilled") availableClients.add("qbittorrent");
  const statuses: ClientStatus[] = [
    ...(sab.status === "fulfilled" ? sab.value.map((item) => ({ ...item, client: "sabnzbd" })) : []),
    ...(qbit.status === "fulfilled" ? qbit.value.map((item) => ({ ...item, client: "qbittorrent" })) : [])
  ];

  const downloads = await prisma.download.findMany();
  let updated = 0;
  const matchedDownloadIds = new Set<string>();
  const consumedStatusIndexes = new Set<number>();

  for (const download of downloads) {
    const matchIndex = statuses.findIndex((status, index) => {
      if (consumedStatusIndexes.has(index) || status.client !== download.client) return false;
      if (download.clientJobId) return Boolean(status.id && download.clientJobId === status.id);
      return status.title && download.title && status.title.toLowerCase().includes(download.title.toLowerCase().slice(0, 40));
    });

    if (matchIndex < 0) continue;
    const match = statuses[matchIndex];
    consumedStatusIndexes.add(matchIndex);
    matchedDownloadIds.add(download.id);
    await prisma.download.update({
      where: { id: download.id },
      data: {
        status: match.status,
        progress: match.progress,
        downloadPath: match.path,
        errorMessage: match.error,
        completedAt: match.status === "completed" ? new Date() : download.completedAt
      }
    });
    updated += 1;
  }

  for (const download of downloads) {
    if (matchedDownloadIds.has(download.id)) continue;
    if (!availableClients.has(download.client) || !["queued", "downloading"].includes(download.status)) continue;
    await prisma.download.update({
      where: { id: download.id },
      data: {
        status: "failed",
        errorMessage: "Download was not found in the client queue or history."
      }
    });
    updated += 1;
  }

  const currentDownloads = await prisma.download.findMany({
    where: { status: { not: "failed" } },
    orderBy: { updatedAt: "desc" }
  });
  const seenReleaseKeys = new Set<string>();

  for (const download of currentDownloads) {
    if (!download.releaseId) continue;
    const key = `${download.releaseId}:${download.client}:${download.category}`;
    if (!seenReleaseKeys.has(key)) {
      seenReleaseKeys.add(key);
      continue;
    }

    await prisma.download.update({
      where: { id: download.id },
      data: {
        status: "failed",
        errorMessage: "Duplicate tracking row for a release already sent to the downloader."
      }
    });
    updated += 1;
  }

  return NextResponse.json({ ok: true, updated });
}
