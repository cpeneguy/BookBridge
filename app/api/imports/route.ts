import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const imports = await prisma.importJob.findMany({ include: { book: true }, orderBy: { updatedAt: "desc" } });
  return NextResponse.json({ imports });
}
