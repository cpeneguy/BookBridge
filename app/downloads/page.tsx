import Image from "next/image";
import { Card, PageHeader, StatusPill } from "@/components/ui";
import { DownloadRefreshButton } from "@/components/download-refresh-button";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function DownloadsPage() {
  const downloads = await prisma.download.findMany({
    include: { book: true },
    orderBy: { updatedAt: "desc" },
    where: {
      OR: [{ errorMessage: null }, { NOT: { errorMessage: { startsWith: "Duplicate tracking row" } } }]
    }
  });

  return (
    <>
      <PageHeader
        title="Downloads"
        description="Jobs sent to SABnzbd or qBittorrent and their current status."
        action={<DownloadRefreshButton />}
      />
      <Card>
        <div className="grid grid-cols-[minmax(260px,1fr)_130px_120px_110px_130px] border-b border-line px-4 py-3 text-xs font-medium uppercase tracking-wide text-slate-500">
          <span>Title</span>
          <span>Client</span>
          <span>Category</span>
          <span>Progress</span>
          <span>Status</span>
        </div>
        <div className="divide-y divide-line">
          {downloads.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-slate-500">No download jobs have been recorded.</div>
          ) : (
            downloads.map((download) => (
              <div className="grid grid-cols-[minmax(260px,1fr)_130px_120px_110px_130px] items-center px-4 py-3" key={download.id}>
                <span className="flex min-w-0 items-center gap-3">
                  <span className="flex h-20 w-14 shrink-0 items-center justify-center overflow-hidden rounded border border-line bg-[#131722]">
                    {download.book.coverUrl ? (
                      <Image alt="" className="h-full w-full object-cover" height={120} src={download.book.coverUrl} unoptimized width={84} />
                    ) : (
                      <span className="text-lg font-black text-[#F1D48A]/25">{bookInitials(download.book.title)}</span>
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{download.title || download.book.title}</span>
                    <span className="block truncate text-sm text-slate-500">{download.errorMessage ?? download.clientJobId ?? download.book.title}</span>
                  </span>
                </span>
                <span className="text-sm text-slate-300">{download.client}</span>
                <span className="text-sm text-slate-300">{download.category}</span>
                <span className="text-sm text-slate-300">{download.progress ?? 0}%</span>
                <StatusPill tone={download.status === "failed" ? "rose" : download.status === "completed" ? "emerald" : "amber"}>{download.status}</StatusPill>
              </div>
            ))
          )}
        </div>
      </Card>
    </>
  );
}

function bookInitials(title: string) {
  return title
    .split(/\s+/)
    .filter((word) => !["a", "an", "and", "of", "the"].includes(word.toLowerCase()))
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}
