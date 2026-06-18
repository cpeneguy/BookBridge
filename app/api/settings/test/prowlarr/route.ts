import { NextRequest, NextResponse } from "next/server";
import { getSettings } from "@/lib/settings";

export async function POST(request: NextRequest) {
  const savedSettings = await getSettings();
  const body = await request.json().catch(() => ({}));
  const settings = { ...savedSettings, ...stringValues(body) };
  if (!settings.prowlarrUrl || !settings.prowlarrApiKey) {
    return NextResponse.json({ ok: false, service: "prowlarr", message: "URL or API key is missing." });
  }
  try {
    const response = await fetch(new URL("/api/v1/system/status", settings.prowlarrUrl.endsWith("/") ? settings.prowlarrUrl : `${settings.prowlarrUrl}/`), {
      headers: { "X-Api-Key": settings.prowlarrApiKey },
      cache: "no-store"
    });
    return NextResponse.json({ ok: response.ok, service: "prowlarr", message: response.ok ? "Connected" : `HTTP ${response.status}` });
  } catch (error) {
    return NextResponse.json({ ok: false, service: "prowlarr", message: error instanceof Error ? error.message : "Connection failed" });
  }
}

function stringValues(values: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, String(value ?? "").trim()]));
}
