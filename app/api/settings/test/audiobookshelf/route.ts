import { NextRequest, NextResponse } from "next/server";
import { getSettings } from "@/lib/settings";

export async function POST(request: NextRequest) {
  const savedSettings = await getSettings();
  const body = await request.json().catch(() => ({}));
  const settings = { ...savedSettings, ...stringValues(body) };

  if (!settings.audiobookshelfUrl || !settings.audiobookshelfApiKey) {
    return NextResponse.json({ ok: false, service: "audiobookshelf", message: "URL or API key is missing." });
  }

  try {
    const response = await fetch(new URL("/api/me", normalizeBaseUrl(settings.audiobookshelfUrl)), {
      headers: {
        Authorization: `Bearer ${settings.audiobookshelfApiKey}`,
        "X-Api-Key": settings.audiobookshelfApiKey
      },
      cache: "no-store"
    });
    const data = await response.json().catch(() => null);

    return NextResponse.json({
      ok: response.ok,
      service: "audiobookshelf",
      message: response.ok ? "Connected" : readableError(data) ?? `HTTP ${response.status}`
    });
  } catch (error) {
    return NextResponse.json({ ok: false, service: "audiobookshelf", message: error instanceof Error ? error.message : "Connection failed" });
  }
}

function normalizeBaseUrl(value: string) {
  return value.endsWith("/") ? value : `${value}/`;
}

function readableError(data: unknown) {
  if (!data || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;
  return typeof record.message === "string" ? record.message : typeof record.error === "string" ? record.error : null;
}

function stringValues(values: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, String(value ?? "").trim()]));
}
