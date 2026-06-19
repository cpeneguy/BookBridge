import { NextRequest, NextResponse } from "next/server";
import { getSettings } from "@/lib/settings";

export async function POST(request: NextRequest) {
  const savedSettings = await getSettings();
  const body = await request.json().catch(() => ({}));
  const settings = { ...savedSettings, ...stringValues(body) };

  if (settings.hardcoverEnabled !== "true") {
    return NextResponse.json({ ok: false, service: "hardcover", message: "Hardcover is disabled." });
  }

  if (!settings.hardcoverEndpoint || !settings.hardcoverApiKey) {
    return NextResponse.json({ ok: false, service: "hardcover", message: "Endpoint or API key is missing." });
  }

  try {
    const response = await fetch(settings.hardcoverEndpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${settings.hardcoverApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        query: "query BookBridgeHardcoverTest { me { id } }"
      }),
      cache: "no-store"
    });

    const data = (await response.json().catch(() => null)) as { data?: unknown; errors?: Array<{ message?: string }> } | null;
    const ok = response.ok && Boolean(data?.data) && !data?.errors?.length;

    return NextResponse.json({
      ok,
      service: "hardcover",
      message: ok ? "Connected" : data?.errors?.[0]?.message ?? `HTTP ${response.status}`
    });
  } catch (error) {
    return NextResponse.json({ ok: false, service: "hardcover", message: error instanceof Error ? error.message : "Connection failed" });
  }
}

function stringValues(values: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, String(value ?? "").trim()]));
}
