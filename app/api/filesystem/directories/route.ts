import { readdir, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";

type DirectoryEntry = {
  name: string;
  path: string;
};

export async function GET(request: NextRequest) {
  const roots = directoryRoots();
  const requestedPath = request.nextUrl.searchParams.get("path")?.trim();
  const currentPath = normalizeDirectoryPath(requestedPath || roots[0]);

  try {
    const info = await stat(currentPath);
    if (!info.isDirectory()) {
      return NextResponse.json({ error: "Path is not a directory." }, { status: 400 });
    }

    const entries = await readdir(currentPath, { withFileTypes: true });
    const directories: DirectoryEntry[] = entries
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
      .map((entry) => ({
        name: entry.name,
        path: path.join(currentPath, entry.name)
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({
      path: currentPath,
      parent: parentPath(currentPath),
      roots,
      directories
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to read directory.",
        path: currentPath,
        parent: parentPath(currentPath),
        roots,
        directories: []
      },
      { status: 400 }
    );
  }
}

function normalizeDirectoryPath(value: string) {
  if (!value || value === "~") return os.homedir();
  return path.resolve(value);
}

function parentPath(value: string) {
  const parent = path.dirname(value);
  return parent === value ? null : parent;
}

function directoryRoots() {
  if (process.platform === "win32") {
    return [path.parse(process.cwd()).root, os.homedir()];
  }

  return ["/mnt", "/media", "/opt", "/home", "/"];
}
