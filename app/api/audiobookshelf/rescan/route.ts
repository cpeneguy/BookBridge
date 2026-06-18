import { NextResponse } from "next/server";
import { getSettings } from "@/lib/settings";

export async function POST() {
  const settings = await getSettings();
  if (!settings.audiobookshelfApiKey) {
    return NextResponse.json({ error: "Audiobookshelf API key is not configured." }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    message: "Audiobookshelf rescan is scaffolded. Add library scan API call here."
  });
}
