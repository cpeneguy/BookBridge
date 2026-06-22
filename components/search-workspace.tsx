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

type FormatRequestState = {
  kind: "requested" | "downloading" | "completed" | "failed";
  label: string;
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
      data.books.map((book) => ({
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
      if (data.book?.id) router.push(`/book?id=${encodeURIComponent(data.book.id)}`);
      return;
    }

    setRequestStatus((current) => ({
      ...current,
      [key]: data.message ?? (data.action === "downloaded" ? "Queued" : "Review needed")
    }));
    void loadRecentRequests();
    if (data.book?.id) router.push(`/book?id=${encodeURIComponent(data.book.id)}`);
  }

  function openPreview(result: MetadataResult) {
    sessionStorage.setItem("bookbridge.previewBook", JSON.stringify(result));
    router.push("/browse/preview");
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

      <div className="grid gap-8 pt-3">
        <BrowseRail
          emptyText={status === "loading" ? "Loading books..." : status === "error" ? "Unable to load books." : "No books found."}
          onRequest={requestBook}
          requestStatus={requestStatus}
          results={results}
          recentBooks={recentBooks}
          libraryStatus={libraryStatus}
          hideCompleted={!query.trim()}
          onPreview={openPreview}
          title={query.trim() ? "Search Results" : "Recently Added"}
        />

        <RequestRail books={recentBooks} libraryStatus={libraryStatus} onOpen={(id) => router.push(`/book?id=${encodeURIComponent(id)}`)} />

        <BrowseRail
          emptyText="No trending books available."
          onRequest={requestBook}
          requestStatus={requestStatus}
          results={results.slice().reverse()}
          recentBooks={recentBooks}
          libraryStatus={libraryStatus}
          hideCompleted
          onPreview={openPreview}
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
  recentBooks,
  onRequest,
  onPreview,
  hideCompleted,
  emptyText,
  libraryStatus
}: {
  title: string;
  results: MetadataResult[];
  requestStatus: Record<string, string>;
  recentBooks: RecentBook[];
  onRequest: (result: MetadataResult, format: "ebook" | "audiobook") => Promise<void>;
  onPreview: (result: MetadataResult) => void;
  hideCompleted?: boolean;
  emptyText: string;
  libraryStatus: LibraryStatus;
}) {
  const visibleResults = hideCompleted ? results.filter((result) => !isDownloadedOrInLibrary(result, recentBooks, libraryStatus)) : results;

  return (
    <section className="min-w-0 [&>div>span]:hidden">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-2xl font-bold tracking-tight text-[#F5F7FB]">{title}</h2>
        <div className="hidden">
          <span className="text-4xl leading-none">‹</span>
          <span className="text-4xl leading-none text-slate-400">›</span>
        </div>
      </div>
      {visibleResults.length === 0 ? (
        <div className="rounded border border-line bg-panel px-4 py-10 text-center text-sm text-slate-500">{emptyText}</div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(145px,1fr))] gap-4">
          {visibleResults.map((result, index) => (
            <PosterCard
              inLibrary={isKnownInLibrary(result, libraryStatus)}
              key={result.resultKey ?? `${result.title}-${result.author}-${index}`}
              onRequest={onRequest}
              onPreview={onPreview}
              requestStatus={requestStatus}
              requestState={requestStateForResult(result, recentBooks, libraryStatus)}
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
  requestState,
  onRequest,
  onPreview,
  inLibrary
}: {
  result: MetadataResult;
  requestStatus: Record<string, string>;
  requestState: Record<"ebook" | "audiobook", FormatRequestState | null>;
  onRequest: (result: MetadataResult, format: "ebook" | "audiobook") => Promise<void>;
  onPreview: (result: MetadataResult) => void;
  inLibrary: boolean;
}) {
  const ebookStatus = requestStatus[`${result.resultKey}-ebook`];
  const audioStatus = requestStatus[`${result.resultKey}-audiobook`];
  const initials = bookInitials(result.title);
  const visibleStates = [
    requestState.ebook ? { format: "Ebook", state: requestState.ebook } : null,
    requestState.audiobook ? { format: "Audio", state: requestState.audiobook } : null
  ].filter(Boolean) as Array<{ format: string; state: FormatRequestState }>;
  const ebookLocked = Boolean(requestState.ebook && ["requested", "downloading", "completed"].includes(requestState.ebook.kind));
  const audioLocked = Boolean(requestState.audiobook && ["requested", "downloading", "completed"].includes(requestState.audiobook.kind));

  return (
    <article
      className="group relative h-[265px] w-full cursor-pointer overflow-hidden rounded-lg border border-line bg-panel shadow-lg shadow-black/30 sm:h-[285px]"
      onClick={() => onPreview(result)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") onPreview(result);
      }}
      role="button"
      tabIndex={0}
    >
      {result.coverUrl ? (
        <Image alt="" className="h-full w-full object-cover" height={360} src={result.coverUrl} unoptimized width={240} />
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
      {visibleStates.length ? (
        <div className="absolute left-0 top-3 flex flex-col gap-1">
          {visibleStates.map(({ format, state }) => (
            <span
              className={`rounded-r px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-white shadow ${
                state.kind === "completed" ? "bg-[#22C55E]" : state.kind === "failed" ? "bg-[#DC2626]" : "bg-[#0EA5E9]"
              }`}
              key={`${format}-${state.kind}`}
            >
              {format} {state.label}
            </span>
          ))}
        </div>
      ) : null}
      {inLibrary ? (
        <div className="absolute right-3 top-3 rounded-full bg-[#22C55E] p-1 text-[#0F1115]" title="In library or previously downloaded">
          <CheckCircle2 size={17} />
        </div>
      ) : null}
      <div className="absolute bottom-0 left-0 right-0 p-3">
        <div className="line-clamp-2 text-sm font-bold leading-tight text-white drop-shadow">{result.title}</div>
        <div className="mt-1 line-clamp-1 text-xs text-slate-300">{result.author}</div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {result.year ? <StatusPill>{result.year}</StatusPill> : null}
          {result.metadataSource ? <StatusPill tone="cyan">{result.metadataSource}</StatusPill> : null}
        </div>
        {(ebookStatus || audioStatus) && <div className="mt-2 line-clamp-2 text-xs text-[#F1D48A]">{ebookStatus ?? audioStatus}</div>}
        {!ebookLocked || !audioLocked ? (
          <div className={`mt-2 grid gap-1.5 opacity-0 transition group-hover:opacity-100 ${!ebookLocked && !audioLocked ? "grid-cols-2" : "grid-cols-1"}`}>
            {!ebookLocked ? (
              <button
                className="rounded bg-[#C89B3C] px-2 py-1.5 text-[11px] font-semibold text-[#0F1115] hover:bg-[#D4A64A]"
                onClick={(event) => {
                  event.stopPropagation();
                  void onRequest(result, "ebook");
                }}
                type="button"
              >
                <BookOpen className="mr-1 inline" size={13} />
                Ebook
              </button>
            ) : null}
            {!audioLocked ? (
              <button
                className="rounded bg-[#7C3AED] px-2 py-1.5 text-[11px] font-semibold text-white hover:bg-[#8B5CF6]"
                onClick={(event) => {
                  event.stopPropagation();
                  void onRequest(result, "audiobook");
                }}
                type="button"
              >
                <Headphones className="mr-1 inline" size={13} />
                Audio
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}

function RequestRail({ books, onOpen, libraryStatus }: { books: RecentBook[]; onOpen: (id: string) => void; libraryStatus: LibraryStatus }) {
  if (books.length === 0) return null;

  return (
    <section className="min-w-0 [&>div>span]:hidden">
      <div className="mb-4 flex items-center gap-3">
        <h2 className="text-2xl font-bold tracking-tight text-[#F5F7FB]">Recent Requests</h2>
        <span className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-500 text-xl text-slate-300">›</span>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(340px,1fr))] gap-5">
        {books.slice(0, 12).map((book) => (
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

function requestStateForResult(result: MetadataResult, books: RecentBook[], libraryStatus: LibraryStatus): Record<"ebook" | "audiobook", FormatRequestState | null> {
  const resultFullKey = libraryKey(result.title, result.author);
  const resultTitleKey = titleKey(result.title);
  const state: Record<"ebook" | "audiobook", FormatRequestState | null> = {
    ebook: null,
    audiobook: null
  };

  for (const book of books) {
    const format = book.formatWanted === "ebook" ? "ebook" : book.formatWanted === "audiobook" ? "audiobook" : null;
    if (!format) continue;

    const sameBook = libraryKey(book.title, book.author) === resultFullKey || titleKey(book.title) === resultTitleKey;
    if (!sameBook) continue;

    const latestDownload = book.downloads?.[0];
    const downloadStatus = latestDownload?.status?.toLowerCase();

    if (downloadStatus === "failed") {
      state[format] = { kind: "failed", label: "failed" };
      continue;
    }

    if (downloadStatus === "completed" || book.status === "imported" || isKnownInLibrary(book, libraryStatus)) {
      state[format] = { kind: "completed", label: "done" };
      continue;
    }

    if (latestDownload || book.status === "downloading") {
      state[format] = { kind: "downloading", label: "sent" };
      continue;
    }

    state[format] = { kind: "requested", label: "wanted" };
  }

  return state;
}

function isDownloadedOrInLibrary(result: MetadataResult, books: RecentBook[], libraryStatus: LibraryStatus) {
  if (isKnownInLibrary(result, libraryStatus)) return true;
  const resultFullKey = libraryKey(result.title, result.author);
  const resultTitleKey = titleKey(result.title);

  return books.some((book) => {
    const sameBook = libraryKey(book.title, book.author) === resultFullKey || titleKey(book.title) === resultTitleKey;
    if (!sameBook) return false;

    const latestDownload = book.downloads?.[0];
    return book.status === "imported" || latestDownload?.status?.toLowerCase() === "completed";
  });
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
