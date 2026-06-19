import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { NextResponse } from "next/server";
import { appBranch, appDirectory, getAppUpdateStatus, updateScriptPath } from "@/lib/app-update";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(await getAppUpdateStatus());
}

export async function POST() {
  const status = await getAppUpdateStatus();
  const scriptPath = updateScriptPath();

  if (!status.available) {
    return NextResponse.json({ ok: false, message: "BookBridge is already up to date." }, { status: 409 });
  }

  if (!scriptPath || !existsSync(scriptPath)) {
    return NextResponse.json({ ok: false, message: "Update script was not found on this install." }, { status: 400 });
  }

  if (process.platform === "win32") {
    return NextResponse.json({ ok: false, message: "In-app updates are only available on the Linux install." }, { status: 400 });
  }

  const command = scriptPath.endsWith(".sh") ? "bash" : scriptPath;
  const args = scriptPath.endsWith(".sh") ? [scriptPath] : [];

  const child = spawn(command, args, {
    cwd: appDirectory(),
    detached: true,
    env: {
      ...process.env,
      APP_DIR: appDirectory(),
      BRANCH: appBranch()
    },
    stdio: "ignore"
  });

  child.unref();

  return NextResponse.json({ ok: true, message: "Update started. BookBridge will restart when the update finishes." });
}
