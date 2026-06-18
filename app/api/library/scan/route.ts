import path from "node:path";
import { readdir } from "node:fs/promises";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";

const ebookExtensions = new Set([".epub", ".mobi", ".azw3", ".pdf"]);
const audioExtensions = new Set([".m4b", ".mp3", ".m4a", ".flac"]);

type FoundItem = {
  title: string;
  author?: string;
  year?: number;
  format: string;
  path: string;
  source: string;
};

export async function POST() {
  const settings = await getSettings();
  const found: FoundItem[] = [];
  const errors: string[] = [];

  await scanRoot(settings.booksPath, "ebook", ebookExtensions, found, errors);
  await scanRoot(settings.audiobooksPath, "audiobook", audioExtensions, found, errors);

  await prisma.libraryItem.deleteMany();

  for (const item of dedupeFoundItems(found)) {
    await prisma.libraryItem.create({ data: item });
  }

  return NextResponse.json({
    ok: errors.length === 0,
    count: found.length,
    errors
  });
}

async function scanRoot(root: string, format: string, extensions: Set<string>, found: FoundItem[], errors: string[]) {
  try {
    await scanDirectory(root, root, format, extensions, found, 0);
  } catch (error) {
    errors.push(`${root}: ${error instanceof Error ? error.message : "Scan failed"}`);
  }
}

async function scanDirectory(root: string, current: string, format: string, extensions: Set<string>, found: FoundItem[], depth: number) {
  if (depth > 5) return;
  const entries = await readdir(current, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(current, entry.name);
    if (entry.isDirectory()) {
      await scanDirectory(root, entryPath, format, extensions, found, depth + 1);
      continue;
    }

    if (!entry.isFile() || !extensions.has(path.extname(entry.name).toLowerCase())) continue;

    const parsed = parseLibraryPath(root, entryPath, format);
    found.push(parsed);
  }
}

function parseLibraryPath(root: string, filePath: string, format: string): FoundItem {
  const relativeParts = path.relative(root, filePath).split(path.sep).filter(Boolean);
  const fileName = path.basename(filePath, path.extname(filePath));
  const titleFolder = relativeParts.length >= 2 ? relativeParts[relativeParts.length - 2] : fileName;
  const authorFolder = relativeParts.length >= 3 ? relativeParts[relativeParts.length - 3] : undefined;
  const parsedTitle = parseTitle(titleFolder);

  return {
    title: parsedTitle.title,
    author: authorFolder,
    year: parsedTitle.year,
    format,
    path: filePath,
    source: "scan"
  };
}

function parseTitle(value: string) {
  const match = value.match(/^(.*?)(?:\s+\((\d{4})\))?$/);
  return {
    title: match?.[1]?.trim() || value,
    year: match?.[2] ? Number(match[2]) : undefined
  };
}

function dedupeFoundItems(items: FoundItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.format}:${item.path}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
