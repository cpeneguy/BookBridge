import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";

const visibleDownloadWhere = {
  OR: [{ errorMessage: null }, { NOT: { errorMessage: { startsWith: "Duplicate tracking row" } } }]
};

export async function GET(request: NextRequest) {
  const settings = await getSettings();
  const authResponse = await authorizeHomepageRequest(request, settings.homepageApiKey);
  if (authResponse) return authResponse;

  const [
    totalBooks,
    wantedBooks,
    downloadingBooks,
    importedBooks,
    ebookRequests,
    audiobookRequests,
    libraryItems,
    totalDownloads,
    queuedDownloads,
    activeDownloads,
    completedDownloads,
    failedDownloads,
    releaseCount,
    recentDownloads,
    recentRequests
  ] = await Promise.all([
    prisma.book.count(),
    prisma.book.count({ where: { status: "wanted" } }),
    prisma.book.count({ where: { status: "downloading" } }),
    prisma.book.count({ where: { status: "imported" } }),
    prisma.book.count({ where: { formatWanted: "ebook" } }),
    prisma.book.count({ where: { formatWanted: "audiobook" } }),
    prisma.libraryItem.count(),
    prisma.download.count({ where: visibleDownloadWhere }),
    prisma.download.count({ where: { ...visibleDownloadWhere, status: "queued" } }),
    prisma.download.count({ where: { ...visibleDownloadWhere, status: "downloading" } }),
    prisma.download.count({ where: { ...visibleDownloadWhere, status: "completed" } }),
    prisma.download.count({ where: { ...visibleDownloadWhere, status: "failed" } }),
    prisma.release.count(),
    prisma.download.findMany({
      include: { book: true },
      orderBy: { updatedAt: "desc" },
      take: 5,
      where: visibleDownloadWhere
    }),
    prisma.book.findMany({
      orderBy: { createdAt: "desc" },
      take: 5
    })
  ]);

  return NextResponse.json(
    {
      app: "BookBridge",
      status: "ok",
      updatedAt: new Date().toISOString(),
      books: {
        total: totalBooks,
        wanted: wantedBooks,
        downloading: downloadingBooks,
        imported: importedBooks,
        ebooks: ebookRequests,
        audiobooks: audiobookRequests
      },
      downloads: {
        total: totalDownloads,
        queued: queuedDownloads,
        downloading: activeDownloads,
        completed: completedDownloads,
        failed: failedDownloads
      },
      library: {
        scanned: libraryItems
      },
      releases: {
        total: releaseCount
      },
      recent: {
        downloads: recentDownloads.map((download) => ({
          id: download.id,
          title: download.title || download.book.title,
          book: download.book.title,
          format: download.book.formatWanted,
          client: download.client,
          category: download.category,
          status: download.status,
          progress: download.progress ?? 0,
          updatedAt: download.updatedAt.toISOString()
        })),
        requests: recentRequests.map((book) => ({
          id: book.id,
          title: book.title,
          author: book.author,
          format: book.formatWanted,
          status: book.status,
          createdAt: book.createdAt.toISOString()
        }))
      }
    },
    {
      headers: {
        "Cache-Control": "no-store"
      }
    }
  );
}

async function authorizeHomepageRequest(request: NextRequest, savedToken: string) {
  const headerToken = request.headers.get("x-api-key");
  const bearerToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const queryToken = request.nextUrl.searchParams.get("key");
  const suppliedToken = headerToken || bearerToken || queryToken;
  const expectedTokens = [process.env.HOMEPAGE_API_KEY, savedToken].filter(Boolean);

  if (!suppliedToken) {
    if (expectedTokens.length > 0) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const apiKeyCount = await prisma.apiKey.count();
    return apiKeyCount > 0 ? NextResponse.json({ error: "Unauthorized" }, { status: 401 }) : null;
  }

  if (suppliedToken && expectedTokens.includes(suppliedToken)) return null;

  const apiKey = await prisma.apiKey.findUnique({ where: { token: suppliedToken } });
  if (apiKey) {
    await prisma.apiKey.update({
      data: { lastUsedAt: new Date() },
      where: { id: apiKey.id }
    });
    return null;
  }

  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
