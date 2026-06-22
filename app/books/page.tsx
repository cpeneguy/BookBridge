import Link from "next/link";
import { Plus } from "lucide-react";
import { BookActions } from "@/components/book-actions";
import { Card, PageHeader, StatusPill } from "@/components/ui";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function BooksPage() {
  const books = await prisma.book.findMany({
    include: { _count: { select: { releases: true, downloads: true } } },
    orderBy: [{ status: "asc" }, { title: "asc" }]
  });

  return (
    <>
      <PageHeader
        title="Books"
        description="Wanted and imported titles tracked by BookBridge."
        action={
          <Link className="inline-flex h-9 items-center gap-2 rounded bg-[#C89B3C] px-3 text-sm font-medium text-[#0F1115] hover:bg-[#D4A64A]" href="/books/new">
            <Plus size={16} />
            Manual Add
          </Link>
        }
      />
      <Card>
        <div className="grid grid-cols-[1fr_120px_120px_170px_120px_190px] border-b border-line px-4 py-3 text-xs font-medium uppercase tracking-wide text-slate-500">
          <span>Title</span>
          <span>Format</span>
          <span>Releases</span>
          <span>Prowlarr</span>
          <span>Status</span>
          <span>Action</span>
        </div>
        <div className="divide-y divide-line">
          {books.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-slate-500">No books in the library yet.</div>
          ) : (
            books.map((book) => (
              <div className="grid grid-cols-[1fr_120px_120px_170px_120px_190px] items-center px-4 py-3 hover:bg-white/[0.03]" key={book.id}>
                <span>
                  <Link className="block font-medium text-slate-100 hover:text-[#F1D48A]" href={`/book?id=${book.id}`}>
                    {book.title}
                  </Link>
                  <span className="block text-sm text-slate-500">
                    {book.author}
                    {book.year ? `, ${book.year}` : ""}
                  </span>
                </span>
                <span className={book.formatWanted === "audiobook" ? "text-sm capitalize text-[#C4B5FD]" : "text-sm capitalize text-[#F1D48A]"}>
                  {book.formatWanted}
                </span>
                <span className="text-sm text-slate-300">{book._count.releases}</span>
                <span className="min-w-0">
                  <StatusPill tone={book.lastReleaseSearchStatus === "failed" ? "rose" : book.lastReleaseSearchStatus === "completed" ? "emerald" : "slate"}>
                    {book.lastReleaseSearchStatus ?? "not searched"}
                  </StatusPill>
                  {book.lastReleaseSearchAt ? (
                    <span className="mt-1 block truncate text-xs text-slate-500" title={book.lastReleaseSearchMessage ?? undefined}>
                      {book.lastReleaseSearchMessage ?? book.lastReleaseSearchAt.toLocaleString()}
                    </span>
                  ) : null}
                </span>
                <span>
                  <StatusPill tone={book.status === "imported" ? "emerald" : "cyan"}>{book.status}</StatusPill>
                </span>
                <BookActions bookId={book.id} canDelete={book._count.downloads === 0} />
              </div>
            ))
          )}
        </div>
      </Card>
    </>
  );
}
