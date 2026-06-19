import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { libraryKey, titleKey } from "@/lib/library-match";

export async function GET() {
  const [items, books] = await Promise.all([
    prisma.libraryItem.findMany({ orderBy: { updatedAt: "desc" } }),
    prisma.book.findMany({
      include: { downloads: { where: { status: "completed" }, take: 1 } },
      where: {
        OR: [{ status: "imported" }, { downloads: { some: { status: "completed" } } }]
      }
    })
  ]);

  const keys = new Set<string>();
  const titleKeys = new Set<string>();

  for (const item of items) {
    keys.add(libraryKey(item.title, item.author));
    titleKeys.add(titleKey(item.title));
  }

  for (const book of books) {
    if (book.status === "imported" || book.downloads.length > 0) {
      keys.add(libraryKey(book.title, book.author));
      titleKeys.add(titleKey(book.title));
    }
  }

  const ebooks = items.filter((item) => item.format === "ebook").length;
  const audiobooks = items.filter((item) => item.format === "audiobook").length;
  const sources = items.reduce<Record<string, number>>((counts, item) => {
    counts[item.source] = (counts[item.source] ?? 0) + 1;
    return counts;
  }, {});
  const lastScannedAt = items[0]?.updatedAt?.toISOString() ?? null;

  return NextResponse.json({
    count: items.length,
    formats: {
      ebooks,
      audiobooks
    },
    sources,
    knownTitles: titleKeys.size,
    lastScannedAt,
    keys: [...keys],
    titleKeys: [...titleKeys],
    scannedItems: items.length
  });
}
