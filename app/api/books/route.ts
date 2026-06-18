import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const books = await prisma.book.findMany({
    include: {
      downloads: {
        orderBy: { updatedAt: "desc" },
        take: 3
      }
    },
    orderBy: { createdAt: "desc" }
  });
  return NextResponse.json({ books });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const title = String(body.title ?? "").trim();
  const author = String(body.author ?? "").trim();

  if (!title || !author) {
    return NextResponse.json({ error: "Title and author are required." }, { status: 400 });
  }

  const year = body.year ? Number(body.year) : null;
  const formatWanted = String(body.formatWanted ?? "audiobook");
  const existingBook = await prisma.book.findFirst({
    where: {
      title: { equals: title },
      author: { equals: author },
      year,
      formatWanted
    }
  });

  if (existingBook) {
    return NextResponse.json({ book: existingBook, existing: true });
  }

  const book = await prisma.book.create({
    data: {
      title,
      sortTitle: title.toLowerCase().replace(/^the\s+/, ""),
      author,
      year,
      isbn: body.isbn ? String(body.isbn) : null,
      description: body.description ? String(body.description) : null,
      coverUrl: body.coverUrl ? String(body.coverUrl) : null,
      metadataSource: body.metadataSource ? String(body.metadataSource) : null,
      seriesName: body.seriesName ? String(body.seriesName) : null,
      seriesPosition: body.seriesPosition ? Number(body.seriesPosition) : null,
      formatWanted,
      status: body.status ? String(body.status) : "wanted"
    }
  });

  return NextResponse.json({ book }, { status: 201 });
}
