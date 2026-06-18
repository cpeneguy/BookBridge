import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { json } from "@/lib/api-response";

export async function GET(request: NextRequest) {
  const bookId = request.nextUrl.searchParams.get("bookId");
  if (!bookId) return NextResponse.json({ error: "bookId is required." }, { status: 400 });

  const book = await prisma.book.findUnique({ where: { id: bookId } });
  if (!book) return NextResponse.json({ error: "Book not found." }, { status: 404 });

  const releases = await prisma.release.findMany({ where: { bookId }, orderBy: [{ score: "desc" }, { createdAt: "desc" }] });
  return json({ releases });
}
