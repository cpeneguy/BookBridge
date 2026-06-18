import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  const { id } = await request.json();
  const job = await prisma.importJob.update({
    where: { id: String(id) },
    data: { status: "pending", log: "Retry requested from BookBridge." }
  });

  return NextResponse.json({ job });
}
