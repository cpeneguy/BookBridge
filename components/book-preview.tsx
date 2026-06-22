"use client";

import { ArrowLeft, BookOpen, CheckCircle2, Headphones } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, Card, PageHeader, StatusPill } from "@/components/ui";
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
  downloads?: Array<{ status: string; progress?: number | null; updatedAt?: string }>;
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

export function BookPreview() {
  const router = useRouter();
  const [book, setBook] = useState<MetadataResult | null>(null);
  const [recentBooks, setRecentBooks] = useState<RecentBook[]>([]);
  const [libraryStatus, setLibraryStatus] = useState<LibraryStatus>({ keys: [], titleKeys: [], scannedItems: 0 });
  const [requestStatus, setRequestStatus] = useState<Record<string, string>>({});

  useEffect(() => {
    const raw = sessionStorage.getItem("bookbridge.previewBook");
    if (raw) setBook(JSON.parse(raw) as MetadataResult);
    void loadRecentRequests();
    void loadLibraryStatus();
  }, []);

  async function loadRecentRequests() {
    const response = await fetch("/api/books");
    if (!response.ok) return;
    const data = (await response.json()) as { books: RecentBook[] };
    setRecentBooks(data.books.map((item) => ({ ...item, resultKey: item.resultKey ?? item.id, metadataSource: item.metadataSource ?? "BookBridge" })));
  }

  async function loadLibraryStatus() {
    const response = await fetch("/api/library/status");
    if (!response.ok) return;
    const data = (await response.json()) as LibraryStatus;
    setLibraryStatus(data);
  }

  async function requestBook(format: "ebook" | "audiobook") {
    if (!book) return;
    const key = `${book.resultKey}-${format}`;
    setRequestStatus((current) => ({ ...current, [key]: `Requesting ${format}...` }));
    const response = await fetch("/api/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...book, format })
    });
    const data = (await response.json()) as {
      action?: "downloaded" | "review" | "failed";
      book?: { id: string };
      message?: string;
      error?: string;
    };

    if (!response.ok) {
      setRequestStatus((current) => ({ ...current, [key]: data.error ?? "Request failed" }));
      return;
    }

    setRequestStatus((current) => ({ ...current, [key]: data.message ?? (data.action === "downloaded" ? "Queued" : "Review needed") }));
    await loadRecentRequests();
    if (data.book?.id) router.push(`/book?id=${encodeURIComponent(data.book.id)}`);
  }

  if (!book) {
    return (
      <>
        <PageHeader title="Book Preview" description="No book preview is loaded." />
        <Button onClick={() => router.push("/browse")} type="button" variant="secondary">
          <ArrowLeft size={16} />
          Back to Browse
        </Button>
      </>
    );
  }

  const state = requestStateForResult(book, recentBooks, libraryStatus);
  const ebookLocked = Boolean(state.ebook && ["requested", "downloading", "completed"].includes(state.ebook.kind));
  const audioLocked = Boolean(state.audiobook && ["requested", "downloading", "completed"].includes(state.audiobook.kind));
  const inLibrary = isKnownInLibrary(book, libraryStatus);

  return (
    <>
      <PageHeader title={book.title} description={`${book.author}${book.year ? `, ${book.year}` : ""}`} />
      <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
        <Card className="p-4">
          <div className="mx-auto flex aspect-[2/3] max-w-[240px] items-center justify-center overflow-hidden rounded border border-line bg-[#131722]">
            {book.coverUrl ? (
              <Image alt="" className="h-full w-full object-cover" height={540} src={book.coverUrl} unoptimized width={360} />
            ) : (
              <span className="text-5xl font-black text-[#F1D48A]/25">{bookInitials(book.title)}</span>
            )}
          </div>
          <div className="mt-4 grid gap-2">
            {inLibrary ? (
              <div className="flex items-center gap-2 text-sm text-[#86EFAC]">
                <CheckCircle2 size={16} />
                In library or previously downloaded
              </div>
            ) : null}
            {state.ebook ? <StatusPill tone={state.ebook.kind === "completed" ? "emerald" : state.ebook.kind === "failed" ? "rose" : "amber"}>Ebook {state.ebook.label}</StatusPill> : null}
            {state.audiobook ? <StatusPill tone={state.audiobook.kind === "completed" ? "emerald" : state.audiobook.kind === "failed" ? "rose" : "amber"}>Audio {state.audiobook.label}</StatusPill> : null}
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex flex-wrap gap-2">
            {book.metadataSource ? <StatusPill tone="cyan">{book.metadataSource}</StatusPill> : null}
            {book.year ? <StatusPill>{book.year}</StatusPill> : null}
            {book.isbn ? <StatusPill>ISBN {book.isbn}</StatusPill> : null}
            {book.averageRating ? <StatusPill tone="amber">{book.averageRating.toFixed(1)} rating</StatusPill> : null}
          </div>

          <p className="mt-5 whitespace-pre-line text-sm leading-7 text-slate-300">{book.description || "No description was provided by the metadata source."}</p>

          <div className="mt-6 flex flex-wrap gap-3">
            {!ebookLocked ? (
              <Button onClick={() => void requestBook("ebook")} type="button">
                <BookOpen size={16} />
                Request Ebook
              </Button>
            ) : null}
            {!audioLocked ? (
              <Button className="bg-[#7C3AED] text-white hover:bg-[#8B5CF6]" onClick={() => void requestBook("audiobook")} type="button">
                <Headphones size={16} />
                Request Audio
              </Button>
            ) : null}
            <Button onClick={() => router.push("/browse")} type="button" variant="secondary">
              <ArrowLeft size={16} />
              Back
            </Button>
          </div>

          {Object.values(requestStatus).filter(Boolean).length ? (
            <div className="mt-4 text-sm text-[#F1D48A]">{Object.values(requestStatus).filter(Boolean).join(" ")}</div>
          ) : null}
        </Card>
      </div>
    </>
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
  const state: Record<"ebook" | "audiobook", FormatRequestState | null> = { ebook: null, audiobook: null };

  for (const item of books) {
    const format = item.formatWanted === "ebook" ? "ebook" : item.formatWanted === "audiobook" ? "audiobook" : null;
    if (!format) continue;
    const sameBook = libraryKey(item.title, item.author) === resultFullKey || titleKey(item.title) === resultTitleKey;
    if (!sameBook) continue;
    const latestDownload = item.downloads?.[0];
    const downloadStatus = latestDownload?.status?.toLowerCase();
    if (downloadStatus === "failed") state[format] = { kind: "failed", label: "failed" };
    else if (downloadStatus === "completed" || item.status === "imported" || isKnownInLibrary(item, libraryStatus)) state[format] = { kind: "completed", label: "done" };
    else if (latestDownload || item.status === "downloading") state[format] = { kind: "downloading", label: "sent" };
    else state[format] = { kind: "requested", label: "wanted" };
  }

  return state;
}

function bookInitials(title: string) {
  return title
    .split(/\s+/)
    .filter((word) => !["a", "an", "and", "of", "the"].includes(word.toLowerCase()))
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}
