import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const apiKeys = await prisma.apiKey.findMany({
    orderBy: { createdAt: "desc" }
  });

  return NextResponse.json({ apiKeys });
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { name?: string; scope?: string };
  const name = body.name?.trim();
  const scope = body.scope?.trim() || "homepage";

  if (!name) {
    return NextResponse.json({ error: "API key name is required." }, { status: 400 });
  }

  const apiKey = await prisma.apiKey.create({
    data: {
      name,
      scope,
      token: `bb_${randomBytes(32).toString("hex")}`
    }
  });

  return NextResponse.json({ apiKey }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "API key id is required." }, { status: 400 });
  }

  await prisma.apiKey.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
