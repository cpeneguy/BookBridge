import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const job = await prisma.importJob.create({
    data: {
      bookId: String(body.bookId),
      downloadId: body.downloadId ? String(body.downloadId) : null,
      sourcePath: String(body.sourcePath),
      targetPath: body.targetPath ? String(body.targetPath) : null,
      status: "manual_review",
      confidence: body.confidence ? Number(body.confidence) : null,
      log: "Manual import review created."
    }
  });

  return NextResponse.json({ job }, { status: 201 });
}
