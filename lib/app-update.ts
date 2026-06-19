import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import packageJson from "@/package.json";

const execFileAsync = promisify(execFile);

export type AppUpdateStatus = {
  available: boolean;
  canRunUpdater: boolean;
  currentCommit: string | null;
  currentMessage: string | null;
  remoteCommit: string | null;
  remoteMessage: string | null;
  branch: string;
  version: string;
  behindBy: number;
  aheadBy: number;
  checkedAt: string;
  updateScript: string | null;
  logTail: string | null;
  error?: string;
};

export function appDirectory() {
  return process.env.BOOKBRIDGE_APP_DIR || process.cwd();
}

export function appBranch() {
  return process.env.BOOKBRIDGE_BRANCH || "main";
}

export function updateScriptPath() {
  if (process.env.BOOKBRIDGE_UPDATE_SCRIPT) return process.env.BOOKBRIDGE_UPDATE_SCRIPT;

  const installedPath = "/usr/local/bin/bookbridge-update";
  if (existsSync(installedPath)) return installedPath;

  const repoPath = path.join(appDirectory(), "install", "update-bookbridge.sh");
  if (existsSync(repoPath)) return repoPath;

  return null;
}

export async function getAppUpdateStatus(): Promise<AppUpdateStatus> {
  const cwd = appDirectory();
  const branch = appBranch();
  const scriptPath = updateScriptPath();
  const base = {
    available: false,
    canRunUpdater: Boolean(scriptPath) && process.platform !== "win32",
    currentCommit: null,
    currentMessage: null,
    remoteCommit: null,
    remoteMessage: null,
    branch,
    version: packageJson.version,
    behindBy: 0,
    aheadBy: 0,
    checkedAt: new Date().toISOString(),
    updateScript: scriptPath,
    logTail: readUpdateLogTail()
  };

  if (!existsSync(path.join(cwd, ".git"))) {
    return { ...base, error: "This install is not a git checkout, so updates cannot be compared." };
  }

  try {
    await git(["fetch", "origin", branch], cwd, 20_000);

    const [currentCommit, currentMessage, remoteCommit, remoteMessage, countOutput] = await Promise.all([
      git(["rev-parse", "--short", "HEAD"], cwd),
      git(["log", "-1", "--pretty=%s"], cwd),
      git(["rev-parse", "--short", `origin/${branch}`], cwd),
      git(["log", "-1", "--pretty=%s", `origin/${branch}`], cwd),
      git(["rev-list", "--left-right", "--count", `HEAD...origin/${branch}`], cwd)
    ]);

    const [aheadRaw, behindRaw] = countOutput.trim().split(/\s+/);
    const aheadBy = Number(aheadRaw) || 0;
    const behindBy = Number(behindRaw) || 0;

    return {
      ...base,
      available: behindBy > 0,
      currentCommit: currentCommit.trim(),
      currentMessage: currentMessage.trim(),
      remoteCommit: remoteCommit.trim(),
      remoteMessage: remoteMessage.trim(),
      behindBy,
      aheadBy
    };
  } catch (error) {
    return {
      ...base,
      error: error instanceof Error ? error.message : "Update check failed."
    };
  }
}

function readUpdateLogTail() {
  const logPath = process.env.BOOKBRIDGE_UPDATE_LOG || "/var/log/bookbridge-update.log";
  if (!existsSync(logPath)) return null;

  try {
    return readFileSync(logPath, "utf8").split(/\r?\n/).filter(Boolean).slice(-20).join("\n");
  } catch {
    return null;
  }
}

async function git(args: string[], cwd: string, timeout = 10_000) {
  const { stdout } = await execFileAsync("git", args, {
    cwd,
    timeout,
    maxBuffer: 1024 * 1024
  });

  return stdout;
}
