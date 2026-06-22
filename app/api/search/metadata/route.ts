import { NextRequest, NextResponse } from "next/server";
import { getSettings } from "@/lib/settings";

type MetadataResult = {
  resultKey: string;
  title: string;
  author: string;
  year?: number;
  isbn?: string;
  description?: string;
  coverUrl?: string;
  metadataSource?: string;
  averageRating?: number;
  ratingsCount?: number;
};

type GoogleBooksItem = {
  id?: string;
  volumeInfo?: {
    title?: string;
    authors?: string[];
    publishedDate?: string;
    industryIdentifiers?: { identifier?: string }[];
    description?: string;
    imageLinks?: { thumbnail?: string };
    averageRating?: number;
    ratingsCount?: number;
  };
};

type OpenLibraryDoc = {
  key?: string;
  title?: string;
  author_name?: string[];
  first_publish_year?: number;
  isbn?: string[];
  cover_i?: number;
};

type HardcoverBook = {
  id?: number | string;
  title?: string;
  subtitle?: string | null;
  release_date?: string | null;
  cached_image?: string | null;
  image?: { url?: string | null } | null;
  rating?: number | null;
  users_count?: number | null;
  ratings_count?: number | null;
  description?: string | null;
  contributions?: Array<{
    author?: {
      name?: string | null;
    } | null;
  }>;
  editions?: Array<{
    isbn_13?: string | null;
    isbn_10?: string | null;
    image?: { url?: string | null } | null;
    cached_image?: string | null;
  }>;
};

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("query")?.trim();
  const discover = request.nextUrl.searchParams.get("discover") === "true";
  if (!query && !discover) return NextResponse.json({ results: [] });
  const searchQuery = query ?? "";
  const settings = await getSettings();

  const providers = discover
    ? [searchHardcoverDiscover(settings), searchGoogleBooks("subject:fiction", { orderBy: "newest", maxResults: 40 })]
    : [searchHardcoverSearch(settings, searchQuery), searchGoogleBooks(searchQuery), searchOpenLibrary(searchQuery)];
  const settled = await Promise.allSettled(providers);
  const merged = settled.flatMap((result) => (result.status === "fulfilled" ? result.value : []));

  const seen = new Set<string>();
  const results = merged.filter((result) => {
    const key = resultKey(result);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map((result, index) => ({
    ...result,
    resultKey: `${result.resultKey}-${index}`
  }));

  const sorted = discover ? rankDiscoverResults(results.length ? results : fallbackDiscoverResults()) : results;

  return NextResponse.json({ results: sorted.slice(0, discover ? 42 : 18) });
}

async function searchGoogleBooks(
  query: string,
  options: {
    orderBy?: "relevance" | "newest";
    maxResults?: number;
  } = {}
): Promise<MetadataResult[]> {
  const url = new URL("https://www.googleapis.com/books/v1/volumes");
  url.searchParams.set("q", query);
  url.searchParams.set("maxResults", String(options.maxResults ?? 10));
  if (options.orderBy) url.searchParams.set("orderBy", options.orderBy);

  const response = await fetch(url, {
    next: { revalidate: 3600 }
  });
  if (!response.ok) return [];
  const data = await response.json();
  return ((data.items ?? []) as GoogleBooksItem[]).map((item) => {
    const info = item.volumeInfo ?? {};
    const isbn = info.industryIdentifiers?.[0]?.identifier;
    return {
      resultKey: item.id ?? isbn ?? `google-${info.title ?? "unknown"}-${info.authors?.join(",") ?? "unknown"}`,
      title: info.title ?? "Unknown title",
      author: Array.isArray(info.authors) ? info.authors.join(", ") : "Unknown author",
      year: info.publishedDate ? Number(String(info.publishedDate).slice(0, 4)) || undefined : undefined,
      isbn,
      description: info.description,
      coverUrl: info.imageLinks?.thumbnail?.replace("http://", "https://"),
      metadataSource: "Google Books",
      averageRating: info.averageRating,
      ratingsCount: info.ratingsCount
    };
  });
}

async function searchOpenLibrary(query: string): Promise<MetadataResult[]> {
  const response = await fetch(`https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=10`, {
    next: { revalidate: 3600 }
  });
  if (!response.ok) return [];
  const data = await response.json();
  return ((data.docs ?? []) as OpenLibraryDoc[]).map((doc) => ({
    resultKey: doc.key ?? `openlibrary-${doc.title ?? "unknown"}-${doc.author_name?.[0] ?? "unknown"}-${doc.first_publish_year ?? "unknown"}`,
    title: doc.title ?? "Unknown title",
    author: Array.isArray(doc.author_name) ? doc.author_name[0] : "Unknown author",
    year: doc.first_publish_year,
    isbn: Array.isArray(doc.isbn) ? doc.isbn[0] : undefined,
    coverUrl: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg` : undefined,
    metadataSource: "Open Library"
  }));
}

async function searchHardcoverDiscover(settings: Record<string, string>): Promise<MetadataResult[]> {
  if (settings.hardcoverEnabled !== "true" || !settings.hardcoverEndpoint || !settings.hardcoverApiKey) return [];

  const response = await fetch(settings.hardcoverEndpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${settings.hardcoverApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      query: `
        query BookBridgeRecentBooks($date: date!, $limit: Int!) {
          books(
            limit: $limit
            where: { release_date: { _gte: $date } }
            order_by: [{ users_count: desc_nulls_last }, { release_date: desc_nulls_last }]
          ) {
            id
            title
            subtitle
            release_date
            cached_image
            rating
            users_count
            ratings_count
            description
            image { url }
            contributions { author { name } }
            editions(limit: 1, order_by: [{ users_count: desc_nulls_last }]) {
              isbn_13
              isbn_10
              cached_image
              image { url }
            }
          }
        }
      `,
      variables: {
        date: `${new Date().getFullYear() - 1}-01-01`,
        limit: 60
      }
    }),
    next: { revalidate: 3600 }
  });

  if (!response.ok) return [];
  const data = await response.json();
  if (Array.isArray(data.errors) && data.errors.length > 0) return [];

  return mapHardcoverBooks(data.data?.books ?? []);
}

async function searchHardcoverSearch(settings: Record<string, string>, query: string): Promise<MetadataResult[]> {
  if (settings.hardcoverEnabled !== "true" || !settings.hardcoverEndpoint || !settings.hardcoverApiKey || !query.trim()) return [];

  const response = await fetch(settings.hardcoverEndpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${settings.hardcoverApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      query: `
        query BookBridgeBookSearch($query: String!, $limit: Int!) {
          books(
            limit: $limit
            where: { title: { _ilike: $query } }
            order_by: [{ users_count: desc_nulls_last }, { ratings_count: desc_nulls_last }]
          ) {
            id
            title
            subtitle
            release_date
            cached_image
            rating
            users_count
            ratings_count
            description
            image { url }
            contributions { author { name } }
            editions(limit: 1, order_by: [{ users_count: desc_nulls_last }]) {
              isbn_13
              isbn_10
              cached_image
              image { url }
            }
          }
        }
      `,
      variables: {
        query: `%${query}%`,
        limit: 10
      }
    }),
    next: { revalidate: 3600 }
  });

  if (!response.ok) return [];
  const data = await response.json();
  if (Array.isArray(data.errors) && data.errors.length > 0) return [];

  return mapHardcoverBooks(data.data?.books ?? []);
}

function mapHardcoverBooks(books: HardcoverBook[]): MetadataResult[] {
  return books.map((book) => {
    const edition = book.editions?.[0];
    const isbn = edition?.isbn_13 ?? edition?.isbn_10 ?? undefined;
    const author = book.contributions?.map((contribution) => contribution.author?.name).filter(Boolean).join(", ");
    const coverUrl = edition?.image?.url ?? edition?.cached_image ?? book.image?.url ?? book.cached_image ?? undefined;
    const year = book.release_date ? Number(String(book.release_date).slice(0, 4)) || undefined : undefined;

    return {
      resultKey: `hardcover-${book.id ?? book.title ?? "unknown"}`,
      title: book.title ?? "Unknown title",
      author: author || "Unknown author",
      year,
      isbn,
      description: book.description ?? undefined,
      coverUrl,
      metadataSource: "Hardcover",
      averageRating: book.rating ?? undefined,
      ratingsCount: book.users_count ?? book.ratings_count ?? undefined
    };
  });
}

function resultKey(result: MetadataResult) {
  if (result.isbn) return `isbn-${result.isbn}`.toLowerCase();
  return `${result.metadataSource ?? "source"}-${result.title}-${result.author}-${result.year ?? ""}-${result.coverUrl ?? ""}`.toLowerCase();
}

function rankDiscoverResults(results: MetadataResult[]) {
  const currentYear = new Date().getFullYear();
  return [...results].sort((a, b) => {
    const recencyA = a.year ? Math.max(0, 8 - Math.abs(currentYear - a.year)) : 0;
    const recencyB = b.year ? Math.max(0, 8 - Math.abs(currentYear - b.year)) : 0;
    const popularityA = Math.log10((a.ratingsCount ?? 0) + 1) * 8 + (a.averageRating ?? 0);
    const popularityB = Math.log10((b.ratingsCount ?? 0) + 1) * 8 + (b.averageRating ?? 0);
    return popularityB + recencyB - (popularityA + recencyA);
  });
}

function fallbackDiscoverResults(): MetadataResult[] {
  return [
    {
      resultKey: "fallback-harvest-season-brynne-weaver",
      title: "Harvest Season",
      author: "Brynne Weaver",
      year: 2026,
      metadataSource: "Publishers Weekly",
      description: "Current hardcover fiction bestseller."
    },
    {
      resultKey: "fallback-whistler-ann-patchett",
      title: "Whistler",
      author: "Ann Patchett",
      year: 2026,
      metadataSource: "Publishers Weekly",
      description: "Current hardcover fiction bestseller."
    },
    {
      resultKey: "fallback-yesteryear-caro-claire-burke",
      title: "Yesteryear",
      author: "Caro Claire Burke",
      year: 2026,
      metadataSource: "Publishers Weekly",
      description: "Current hardcover fiction bestseller."
    },
    {
      resultKey: "fallback-light-wielder-rachel-schneider",
      title: "Light Wielder",
      author: "Rachel Schneider",
      year: 2026,
      metadataSource: "Publishers Weekly",
      description: "Current hardcover fiction bestseller."
    },
    {
      resultKey: "fallback-the-ballad-of-falling-dragons-sarah-a-parker",
      title: "The Ballad of Falling Dragons",
      author: "Sarah A. Parker",
      year: 2026,
      metadataSource: "Publishers Weekly",
      description: "Current hardcover fiction bestseller."
    },
    {
      resultKey: "fallback-the-correspondent-virginia-evans",
      title: "The Correspondent",
      author: "Virginia Evans",
      year: 2025,
      isbn: "9780241721254",
      coverUrl: "https://covers.openlibrary.org/b/isbn/9780241721254-L.jpg",
      metadataSource: "NYT Bestseller",
      description: "Recent fiction bestseller with broad reader interest."
    },
    {
      resultKey: "fallback-contrapposto-dave-eggers",
      title: "Contrapposto",
      author: "Dave Eggers",
      year: 2026,
      isbn: "9780593803509",
      coverUrl: "https://covers.openlibrary.org/b/isbn/9780593803509-L.jpg",
      metadataSource: "New Release",
      description: "Notable 2026 literary fiction release."
    },
    {
      resultKey: "fallback-departures-julian-barnes",
      title: "Departure(s)",
      author: "Julian Barnes",
      year: 2026,
      isbn: "9781787335721",
      coverUrl: "https://covers.openlibrary.org/b/isbn/9781787335721-L.jpg",
      metadataSource: "New Release",
      description: "Notable 2026 fiction release."
    },
    {
      resultKey: "fallback-twelve-months-jim-butcher",
      title: "Twelve Months",
      author: "Jim Butcher",
      year: 2026,
      metadataSource: "NYT Bestseller",
      description: "Recent fiction bestseller."
    },
    {
      resultKey: "fallback-stolen-in-death-j-d-robb",
      title: "Stolen in Death",
      author: "J. D. Robb",
      year: 2026,
      metadataSource: "NYT Bestseller",
      description: "Recent fiction bestseller."
    }
  ].map((result, index) => ({ ...result, resultKey: `${result.resultKey}-${index}` }));
}
