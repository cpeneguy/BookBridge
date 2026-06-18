import { NextResponse } from "next/server";
import { getSettings } from "@/lib/settings";

export async function GET() {
  const settings = await getSettings();
  return NextResponse.json({
    configured: Boolean(settings.audiobookshelfUrl && settings.audiobookshelfApiKey),
    url: settings.audiobookshelfUrl
  });
}
