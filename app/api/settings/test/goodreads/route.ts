import { NextRequest, NextResponse } from "next/server";
import { getSettings } from "@/lib/settings";

export async function POST(request: NextRequest) {
  const savedSettings = await getSettings();
  const body = await request.json().catch(() => ({}));
  const settings = { ...savedSettings, ...stringValues(body) };

  if (settings.goodreadsEnabled !== "true") {
    return NextResponse.json({ ok: false, service: "goodreads", message: "Goodreads is disabled." });
  }

  if (!settings.goodreadsUrl || !settings.goodreadsApiKey) {
    return NextResponse.json({ ok: false, service: "goodreads", message: "URL or API key is missing." });
  }

  try {
    const url = new URL("/search/index.xml", normalizeBaseUrl(settings.goodreadsUrl));
    url.searchParams.set("key", settings.goodreadsApiKey);
    url.searchParams.set("q", "BookBridge");

    const response = await fetch(url, { cache: "no-store" });
    const text = await response.text();
    const looksValid = response.ok && /<GoodreadsResponse[\s>]/i.test(text);

    return NextResponse.json({
      ok: looksValid,
      service: "goodreads",
      message: looksValid ? "Connected" : response.ok ? "Unexpected Goodreads response." : `HTTP ${response.status}`
    });
  } catch (error) {
    return NextResponse.json({ ok: false, service: "goodreads", message: error instanceof Error ? error.message : "Connection failed" });
  }
}

function normalizeBaseUrl(value: string) {
  return value.endsWith("/") ? value : `${value}/`;
}

function stringValues(values: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, String(value ?? "").trim()]));
}
