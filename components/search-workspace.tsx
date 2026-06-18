"use client";

import { BookOpen, CheckCircle2, Headphones, Search, X } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, StatusPill } from "@/components/ui";
import { libraryKey, titleKey } from "@/lib/library-match";

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

type RecentBook = MetadataResult & {
  id: string;
  formatWanted: string;
  status: string;
  downloads?: Array<{
    status: string;
    progress?: number | null;
    updatedAt?: string;
  }>;
};

type LibraryStatus = {
  keys: string[];
  titleKeys: string[];
  scannedItems: number;
};

export function SearchWorkspace() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MetadataResult[]>([]);
  const [recentBooks, setRecentBooks] = useState<RecentBook[]>([]);
  const [libraryStatus, setLibraryStatus] = useState<LibraryStatus>({ keys: [], titleKeys: [], scannedItems: 0 });
  const [status, setStatus] = useState<"idle" | "loading" | "empty" | "error">("idle");
  const [requestStatus, setRequestStatus] = useState<Record<string, string>>({});

  useEffect(() => {
    void loadDiscover();
    void loadRecentRequests();
    void loadLibraryStatus();
  }, []);

  async function loadDiscover() {
    setStatus("loading");
    const response = await fetch("/api/search/books?discover=true");
    if (!response.ok) {
      setStatus("error");
      return;
    }
    const data = (await response.json()) as { results: MetadataResult[] };
    setResults(data.results);
    setStatus(data.results.length ? "idle" : "empty");
  }

  async function loadRecentRequests() {
    const response = await fetch("/api/books");
    if (!response.ok) return;
    const data = (await response.json()) as { books: RecentBook[] };
    setRecentBooks(
      data.books.slice(0, 12).map((book) => ({
        ...book,
        resultKey: book.resultKey ?? book.id,
        metadataSource: book.metadataSource ?? "BookBridge"
      }))
    );
  }

  async function loadLibraryStatus() {
    const response = await fetch("/api/library/status");
    if (!response.ok) return;
    const data = (await response.json()) as LibraryStatus;
    setLibraryStatus(data);
  }

  async function runSearch() {
    if (!query.trim()) return;
    setStatus("loading");
    const response = await fetch(`/api/search/books?query=${encodeURIComponent(query)}`);
    if (!response.ok) {
      setStatus("error");
      return;
    }
    const data = (await response.json()) as { results: MetadataResult[] };
    setResults(data.results);
    setStatus(data.results.length ? "idle" : "empty");
  }

  function clear() {
    setQuery("");
    void loadDiscover();
  }

  async function requestBook(result: MetadataResult, format: "ebook" | "audiobook") {
    const key = `${result.resultKey}-${format}`;
    setRequestStatus((current) => ({ ...current, [key]: `Requesting ${format}...` }));
    const response = await fetch("/api/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...result, format })
    });
    const data = (await response.json()) as {
      action?: "downloaded" | "review" | "failed";
      book?: { id: string };
      message?: string;
      error?: string;
    };

    if (!response.ok) {
      setRequestStatus((current) => ({ ...current, [key]: data.error ?? "Request failed" }));
      if (data.book?.id) router.push(`/books/${data.book.id}`);
      return;
    }

    setRequestStatus((current) => ({
      ...current,
      [key]: data.message ?? (data.action === "downloaded" ? "Queued" : "Review needed")
    }));
    void loadRecentRequests();
    if (data.book?.id) router.push(`/books/${data.book.id}`);
  }

  return (
    <div className="-mx-4 -my-6 min-h-screen bg-[#0F1115] px-4 py-5 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
      <div className="sticky top-0 z-10 -mx-4 bg-[#0F1115]/95 px-4 pb-6 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="grid gap-3 md:grid-cols-[1fr_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-[#C89B3C]" size={25} />
            <input
              className="h-14 w-full rounded-full border border-[#2A303B] bg-[#171A21] pl-14 pr-5 text-xl text-[#F5F7FB] outline-none transition placeholder:text-slate-500 focus:border-[#C89B3C]/80 focus:ring-2 focus:ring-[#C89B3C]/15"
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void runSearch();
              }}
              placeholder="Search Books & Audiobooks"
              value={query}
            />
          </div>
          <div className="flex gap-2">
            <Button className="h-14 rounded-full px-5" disabled={status === "loading"} onClick={runSearch}>
              <Search size={18} />
              Search
            </Button>
            <Button className="h-14 rounded-full px-4" onClick={clear} variant="secondary">
              <X size={18} />
              Clear
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-10 pt-4">
        <BrowseRail
          emptyText={status === "loading" ? "Loading books..." : status === "error" ? "Unable to load books." : "No books found."}
          onRequest={requestBook}
          requestStatus={requestStatus}
          results={results}
          libraryStatus={libraryStatus}
          title={query.trim() ? "Search Results" : "Recently Added"}
        />

        <RequestRail books={recentBooks} libraryStatus={libraryStatus} onOpen={(id) => router.push(`/books/${id}`)} />

        <BrowseRail
          emptyText="No trending books available."
          onRequest={requestBook}
          requestStatus={requestStatus}
          results={results.slice().reverse()}
          libraryStatus={libraryStatus}
          title="Trending"
        />
      </div>
    </div>
  );
}

function BrowseRail({
  title,
  results,
  requestStatus,
  onRequest,
  emptyText,
  libraryStatus
}: {
  title: string;
  results: MetadataResult[];
  requestStatus: Record<string, string>;
  onRequest: (result: MetadataResult, format: "ebook" | "audiobook") => Promise<void>;
  emptyText: string;
  libraryStatus: LibraryStatus;
}) {
  return (
    <section className="min-w-0 [&>div>span]:hidden">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight text-[#F5F7FB]">{title}</h2>
        <div className="hidden">
          <span className="text-4xl leading-none">‹</span>
          <span className="text-4xl leading-none text-slate-400">›</span>
        </div>
      </div>
      {results.length === 0 ? (
        <div className="rounded border border-line bg-panel px-4 py-10 text-center text-sm text-slate-500">{emptyText}</div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-5">
          {results.map((result, index) => (
            <PosterCard
              inLibrary={isKnownInLibrary(result, libraryStatus)}
              key={result.resultKey ?? `${result.title}-${result.author}-${index}`}
              onRequest={onRequest}
              requestStatus={requestStatus}
              result={result}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function PosterCard({
  result,
  requestStatus,
  onRequest,
  inLibrary
}: {
  result: MetadataResult;
  requestStatus: Record<string, string>;
  onRequest: (result: MetadataResult, format: "ebook" | "audiobook") => Promise<void>;
  inLibrary: boolean;
}) {
  const ebookStatus = requestStatus[`${result.resultKey}-ebook`];
  const audioStatus = requestStatus[`${result.resultKey}-audiobook`];
  const initials = bookInitials(result.title);

  return (
    <article className="group relative h-[330px] w-full overflow-hidden rounded-lg border border-line bg-panel shadow-lg shadow-black/30">
      {result.coverUrl ? (
        <Image alt="" className="h-full w-full object-cover" height={420} src={result.coverUrl} unoptimized width={280} />
      ) : (
        <div className="relative h-full w-full overflow-hidden bg-[radial-gradient(circle_at_32%_22%,rgba(200,155,60,0.34),transparent_31%),radial-gradient(circle_at_78%_10%,rgba(124,58,237,0.28),transparent_25%),linear-gradient(145deg,#222633,#131722_58%,#0F1115)]">
          <div className="absolute inset-x-7 top-20 h-px bg-[#C89B3C]/30" />
          <div className="absolute inset-x-10 top-24 h-px bg-[#7C3AED]/30" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="rounded-full border border-[#C89B3C]/20 bg-black/10 px-5 py-4 text-5xl font-black tracking-wide text-[#F1D48A]/25">{initials}</div>
          </div>
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/15 to-black/15" />
      {inLibrary ? (
        <div className="absolute right-3 top-3 rounded-full bg-[#22C55E] p-1 text-[#0F1115]" title="In library or previously downloaded">
          <CheckCircle2 size={17} />
        </div>
      ) : null}
      <div className="absolute bottom-0 left-0 right-0 p-4">
        <div className="text-base font-bold leading-tight text-white drop-shadow">{result.title}</div>
        <div className="mt-1 line-clamp-1 text-sm text-slate-300">{result.author}</div>
        <div className="mt-3 flex flex-wrap gap-2">
          {result.year ? <StatusPill>{result.year}</StatusPill> : null}
          {result.metadataSource ? <StatusPill tone="cyan">{result.metadataSource}</StatusPill> : null}
        </div>
        {(ebookStatus || audioStatus) && <div className="mt-2 line-clamp-2 text-xs text-[#F1D48A]">{ebookStatus ?? audioStatus}</div>}
        <div className="mt-3 grid grid-cols-2 gap-2 opacity-0 transition group-hover:opacity-100">
          <button
            className="rounded bg-[#C89B3C] px-2 py-2 text-xs font-semibold text-[#0F1115] hover:bg-[#D4A64A]"
            onClick={() => void onRequest(result, "ebook")}
            type="button"
          >
            <BookOpen className="mr-1 inline" size={13} />
            Ebook
          </button>
          <button
            className="rounded bg-[#7C3AED] px-2 py-2 text-xs font-semibold text-white hover:bg-[#8B5CF6]"
            onClick={() => void onRequest(result, "audiobook")}
            type="button"
          >
            <Headphones className="mr-1 inline" size={13} />
            Audio
          </button>
        </div>
      </div>
    </article>
  );
}

function RequestRail({ books, onOpen, libraryStatus }: { books: RecentBook[]; onOpen: (id: string) => void; libraryStatus: LibraryStatus }) {
  if (books.length === 0) return null;

  return (
    <section className="min-w-0 [&>div>span]:hidden">
      <div className="mb-5 flex items-center gap-3">
        <h2 className="text-3xl font-bold tracking-tight text-[#F5F7FB]">Recent Requests</h2>
        <span className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-500 text-xl text-slate-300">›</span>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(340px,1fr))] gap-5">
        {books.map((book) => (
          <RequestCard book={book} inLibrary={isKnownInLibrary(book, libraryStatus)} key={book.id} onOpen={onOpen} />
        ))}
      </div>
    </section>
  );
}

function RequestCard({ book, inLibrary, onOpen }: { book: RecentBook; inLibrary: boolean; onOpen: (id: string) => void }) {
  const status = requestDisplayStatus(book, inLibrary);

  return (
    <button
      className="relative h-[190px] w-full overflow-hidden rounded-lg border border-line bg-panel text-left shadow-lg shadow-black/30"
      onClick={() => onOpen(book.id)}
      type="button"
    >
      {book.coverUrl ? (
        <Image alt="" className="absolute inset-0 h-full w-full object-cover opacity-35" height={260} src={book.coverUrl} unoptimized width={520} />
      ) : (
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_75%_35%,rgba(200,155,60,0.24),transparent_28%),radial-gradient(circle_at_20%_20%,rgba(124,58,237,0.18),transparent_24%),linear-gradient(115deg,#222633,#131722_60%,#0F1115)]" />
      )}
      <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/55 to-black/20" />
      <div className="relative z-10 flex h-full items-center justify-between gap-5 p-5">
        <div className="min-w-0">
          <div className="text-sm font-bold text-slate-200">{book.year ?? "Unknown"}</div>
          <div className="mt-1 line-clamp-2 text-2xl font-bold text-white">{book.title}</div>
          <div className="mt-2 text-sm font-semibold text-slate-300">{book.author}</div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-slate-400">Status</span>
            <StatusPill tone={status.tone}>{status.label}</StatusPill>
            <StatusPill tone={book.formatWanted === "audiobook" ? "purple" : "cyan"}>{book.formatWanted}</StatusPill>
          </div>
        </div>
        <div className="flex h-32 w-24 shrink-0 items-center justify-center overflow-hidden rounded bg-[#131722]">
          {book.coverUrl ? (
            <Image alt="" className="h-full w-full object-cover" height={180} src={book.coverUrl} unoptimized width={120} />
          ) : (
            <span className="text-2xl font-black text-[#F1D48A]/25">{bookInitials(book.title)}</span>
          )}
        </div>
      </div>
    </button>
  );
}

function isKnownInLibrary(result: MetadataResult, libraryStatus: LibraryStatus) {
  const fullKey = libraryKey(result.title, result.author);
  const shortKey = titleKey(result.title);
  return libraryStatus.keys.includes(fullKey) || libraryStatus.titleKeys.includes(shortKey);
}

function requestDisplayStatus(book: RecentBook, inLibrary: boolean): { label: string; tone: "cyan" | "emerald" | "amber" | "rose" | "slate" } {
  const latestDownload = book.downloads?.[0];
  const downloadStatus = latestDownload?.status?.toLowerCase();

  if (downloadStatus === "failed") return { label: "Failed", tone: "rose" };
  if (downloadStatus === "completed" || book.status === "imported" || inLibrary) return { label: "Completed", tone: "emerald" };
  if (latestDownload || book.status === "downloading") return { label: "Downloading", tone: "amber" };
  return { label: "Requested", tone: "cyan" };
}

function bookInitials(title: string) {
  return title
    .split(/\s+/)
    .filter((word) => !["a", "an", "and", "of", "the"].includes(word.toLowerCase()))
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}
