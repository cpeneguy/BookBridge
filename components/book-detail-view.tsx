import Image from "next/image";
import { notFound } from "next/navigation";
import { Card, PageHeader, StatusPill } from "@/components/ui";
import { ReleaseSearchPanel } from "@/components/release-search-panel";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";

export async function BookDetailView({ id }: { id: string }) {
  const [book, settings] = await Promise.all([
    prisma.book.findUnique({
      where: { id },
      include: {
        releases: { orderBy: [{ score: "desc" }, { createdAt: "desc" }] },
        downloads: { orderBy: { updatedAt: "desc" } }
      }
    }),
    getSettings()
  ]);

  if (!book) notFound();

  return (
    <>
      <PageHeader title={book.title} description={`${book.author}${book.year ? `, ${book.year}` : ""}`} />
      <div className="grid min-w-0 gap-4 xl:grid-cols-[240px_minmax(0,1fr)] 2xl:grid-cols-[260px_minmax(0,1fr)]">
        <Card className="min-w-0 p-4">
          <div className="mx-auto flex aspect-[2/3] max-w-[200px] items-center justify-center overflow-hidden rounded border border-line bg-[#131722] 2xl:max-w-[220px]">
            {book.coverUrl ? (
              <Image alt="" className="h-full w-full rounded object-cover" height={480} src={book.coverUrl} unoptimized width={320} />
            ) : (
              <span className="text-5xl font-black tracking-wide text-[#F1D48A]/25">{bookInitials(book.title)}</span>
            )}
          </div>
          <div className="mt-4 grid gap-2 text-sm">
            <Info label="Format" value={book.formatWanted} valueClassName={book.formatWanted === "audiobook" ? "text-[#C4B5FD]" : "text-[#F1D48A]"} />
            <Info label="Status" value={book.status} />
            <Info label="Source" value={book.metadataSource ?? "Manual"} />
            <Info
              label="Prowlarr"
              tone={book.lastReleaseSearchStatus === "failed" ? "rose" : book.lastReleaseSearchStatus === "completed" ? "emerald" : "slate"}
              value={book.lastReleaseSearchMessage ?? "Not searched"}
            />
            <Info label="Series" value={book.seriesName ?? "None"} />
            <Info label="ISBN" value={book.isbn ?? "Unknown"} />
          </div>
          {book.description ? <p className="mt-4 text-sm leading-6 text-slate-400">{book.description}</p> : null}
        </Card>
        <div className="grid min-w-0 content-start gap-4">
          <ReleaseSearchPanel
            bookId={book.id}
            clients={{
              sabnzbd: settings.sabEnabled === "true" && Boolean(settings.sabUrl && settings.sabApiKey),
              qbittorrent: settings.qbittorrentEnabled === "true" && Boolean(settings.qbittorrentUrl && settings.qbittorrentUsername)
            }}
            initialReleases={book.releases.map((release) => ({
              id: release.id,
              title: release.title,
              indexer: release.indexer,
              protocol: release.protocol,
              size: release.size?.toString() ?? null,
              age: release.age,
              seeders: release.seeders,
              category: release.category,
              format: release.format,
              score: release.score,
              warnings: release.warnings
            }))}
            downloads={book.downloads.map((download) => ({
              releaseId: download.releaseId,
              category: download.category,
              status: download.status,
              client: download.client
            }))}
          />
          <Card className="min-w-0 overflow-hidden">
            <div className="border-b border-line px-4 py-3 text-sm font-semibold">Downloads</div>
            <div className="divide-y divide-line">
              {book.downloads.length === 0 ? (
                <Empty text="No downloads have been sent for this book." />
              ) : (
                book.downloads.map((download) => (
                  <div className="flex min-w-0 justify-between gap-4 px-4 py-3 text-sm" key={download.id}>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{download.title || `${download.client} download`}</span>
                      <span className="block text-xs text-slate-500">
                        {download.client} / {download.category} / {download.progress ?? 0}%
                      </span>
                    </span>
                    <StatusPill tone={download.status === "failed" ? "rose" : download.status === "completed" ? "emerald" : "amber"}>{download.status}</StatusPill>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

function Info({
  label,
  value,
  tone,
  valueClassName
}: {
  label: string;
  value: string;
  tone?: "cyan" | "emerald" | "amber" | "rose" | "slate";
  valueClassName?: string;
}) {
  return (
    <div className="grid grid-cols-[80px_minmax(0,1fr)] gap-3 border-b border-line pb-2">
      <span className="text-slate-500">{label}</span>
      {tone ? (
        <span className="min-w-0">
          <StatusPill tone={tone}>{value.length > 32 ? value.slice(0, 32).trimEnd() + "..." : value}</StatusPill>
          {value.length > 32 ? <span className="mt-1 block break-words text-xs leading-5 text-slate-500">{value}</span> : null}
        </span>
      ) : (
        <span className={`min-w-0 break-words text-right ${valueClassName ?? "text-slate-200"}`}>{value}</span>
      )}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="px-4 py-8 text-center text-sm text-slate-500">{text}</div>;
}

function bookInitials(title: string) {
  return title
    .split(/\s+/)
    .filter((word) => !["a", "an", "and", "of", "the"].includes(word.toLowerCase()))
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}
