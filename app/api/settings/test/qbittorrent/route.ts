import { NextRequest, NextResponse } from "next/server";
import { testQbittorrent } from "@/lib/integrations/qbittorrent";
import { getSettings } from "@/lib/settings";

export async function POST(request: NextRequest) {
  const savedSettings = await getSettings();
  const body = await request.json().catch(() => ({}));
  const settings = { ...savedSettings, ...stringValues(body) };
  return NextResponse.json({ service: "qbittorrent", ...(await testQbittorrent(settings)) });
}

function stringValues(values: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, String(value ?? "").trim()]));
}
