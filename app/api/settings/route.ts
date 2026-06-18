import { NextRequest, NextResponse } from "next/server";
import { getSettings, saveSettings } from "@/lib/settings";

export async function GET() {
  return NextResponse.json({ settings: await getSettings() });
}

export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const values = Object.fromEntries(Object.entries(body).map(([key, value]) => [key, String(value ?? "")]));
  return NextResponse.json({ settings: await saveSettings(values) });
}
