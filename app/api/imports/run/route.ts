import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({
    ok: true,
    message: "Importer run is scaffolded. Completed-folder scanning and move/rename rules belong here."
  });
}
