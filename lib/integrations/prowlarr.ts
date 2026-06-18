import type { Book } from "@prisma/client";
import { scoreRelease } from "@/lib/scoring";

type Settings = Record<string, string>;

type ProwlarrItem = {
  title?: string;
  indexer?: string;
  indexerId?: number;
  protocol?: string;
  downloadUrl?: string;
  magnetUrl?: string;
  guid?: string;
  size?: number;
  age?: number;
  ageHours?: number;
  seeders?: number;
  categories?: { id?: number; name?: string }[];
};

export type NormalizedRelease = {
  title: string;
  indexer?: string;
  protocol: string;
  downloadUrl: string;
  guid?: string;
  size?: bigint;
  age?: string;
  seeders?: number;
  category?: string;
  format: string;
  score: number;
  warnings: string[];
};

export async function searchProwlarrReleases({
  settings,
  book,
  format
}: {
  settings: Settings;
  book: Pick<Book, "title" | "author" | "year">;
  format: "ebook" | "audiobook";
}) {
  if (!settings.prowlarrUrl || !settings.prowlarrApiKey) {
    throw new Error("Prowlarr URL and API key are required.");
  }

  const categories = format === "ebook" ? settings.prowlarrEbookCategories : settings.prowlarrAudiobookCategories;
  const url = new URL("/api/v1/search", normalizeBaseUrl(settings.prowlarrUrl));
  url.searchParams.set("query", `${book.author} ${book.title}`);
  for (const category of parseCategories(categories)) {
    url.searchParams.append("categories", category);
  }

  const response = await fetch(url, {
    headers: { "X-Api-Key": settings.prowlarrApiKey },
    cache: "no-store"
  });

  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(`Prowlarr search failed with HTTP ${response.status}${message ? `: ${message}` : ""}.`);
  }

  const data = (await response.json()) as ProwlarrItem[];
  return data.map((item) => {
    const releaseTitle = item.title ?? "Untitled release";
    const protocol = item.protocol ?? "unknown";
    const scored = scoreRelease({ book, releaseTitle, format, protocol });
    return {
      title: releaseTitle,
      indexer: item.indexer ?? (item.indexerId ? `Indexer ${item.indexerId}` : undefined),
      protocol,
      downloadUrl: item.downloadUrl ?? item.magnetUrl ?? item.guid ?? "",
      guid: item.guid,
      size: item.size ? BigInt(item.size) : undefined,
      age: typeof item.age === "number" ? `${item.age}d` : typeof item.ageHours === "number" ? `${Math.round(item.ageHours)}h` : undefined,
      seeders: item.seeders,
      category: item.categories?.map((category) => category.name ?? category.id).filter(Boolean).join(", "),
      format,
      score: scored.score,
      warnings: scored.warnings
    } satisfies NormalizedRelease;
  });
}

function normalizeBaseUrl(value: string) {
  return value.endsWith("/") ? value : `${value}/`;
}

function parseCategories(value?: string) {
  return (value ?? "")
    .split(",")
    .map((category) => category.trim())
    .filter(Boolean);
}
