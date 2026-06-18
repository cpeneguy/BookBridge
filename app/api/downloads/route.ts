import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const downloads = await prisma.download.findMany({
    include: { book: true },
    orderBy: { updatedAt: "desc" },
    where: {
      OR: [{ errorMessage: null }, { NOT: { errorMessage: { startsWith: "Duplicate tracking row" } } }]
    }
  });
  return NextResponse.json({ downloads });
}
