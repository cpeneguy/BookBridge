import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { json } from "@/lib/api-response";
import { searchProwlarrReleases } from "@/lib/integrations/prowlarr";
import { getSettings } from "@/lib/settings";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const bookId = String(body.bookId ?? "");
  const format = String(body.format ?? "audiobook") as "ebook" | "audiobook";

  if (!["ebook", "audiobook"].includes(format)) {
    return NextResponse.json({ error: "format must be ebook or audiobook." }, { status: 400 });
  }

  const book = await prisma.book.findUnique({ where: { id: bookId } });
  if (!book) return NextResponse.json({ error: "Book not found." }, { status: 404 });

  try {
    await prisma.book.update({
      where: { id: bookId },
      data: {
        lastReleaseSearchAt: new Date(),
        lastReleaseSearchFormat: format,
        lastReleaseSearchStatus: "searching",
        lastReleaseSearchMessage: "Searching Prowlarr"
      }
    });

    const settings = await getSettings();
    const results = await searchProwlarrReleases({ settings, book, format });

    await prisma.release.deleteMany({ where: { bookId, format } });
    const releases = await Promise.all(
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

    await prisma.book.update({
      where: { id: bookId },
      data: {
        lastReleaseSearchAt: new Date(),
        lastReleaseSearchFormat: format,
        lastReleaseSearchStatus: "completed",
        lastReleaseSearchMessage: `${releases.length} releases found`
      }
    });

    return json({ releases });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Release search failed.";
    await prisma.book.update({
      where: { id: bookId },
      data: {
        lastReleaseSearchAt: new Date(),
        lastReleaseSearchFormat: format,
        lastReleaseSearchStatus: "failed",
        lastReleaseSearchMessage: message
      }
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
