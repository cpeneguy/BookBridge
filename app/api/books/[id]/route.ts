import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { json } from "@/lib/api-response";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const book = await prisma.book.findUnique({
    where: { id },
    include: { releases: true, downloads: true, imports: true }
  });

  if (!book) return NextResponse.json({ error: "Book not found." }, { status: 404 });
  return json({ book });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json();
  const book = await prisma.book.update({
    where: { id },
    data: {
      title: body.title,
      author: body.author,
      year: body.year === "" ? null : body.year ? Number(body.year) : undefined,
      status: body.status,
      formatWanted: body.formatWanted
    }
  });
  return NextResponse.json({ book });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const book = await prisma.book.findUnique({
    where: { id },
    include: { _count: { select: { downloads: true } } }
  });

  if (!book) return NextResponse.json({ error: "Book not found." }, { status: 404 });
  if (book._count.downloads > 0) {
    return NextResponse.json({ error: "Books with download history cannot be deleted." }, { status: 409 });
  }

  await prisma.book.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
