import { NextResponse } from "next/server";
import { getSettings } from "@/lib/settings";

export async function POST() {
  const settings = await getSettings();
  return NextResponse.json({ ok: Boolean(settings.audiobookshelfUrl && settings.audiobookshelfApiKey), service: "audiobookshelf" });
}
