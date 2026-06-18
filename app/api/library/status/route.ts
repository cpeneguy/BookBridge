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

  return NextResponse.json({
    count: items.length,
    keys: [...keys],
    titleKeys: [...titleKeys],
    scannedItems: items.length
  });
}
