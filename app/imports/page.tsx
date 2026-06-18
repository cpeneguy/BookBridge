import { Card, PageHeader, StatusPill } from "@/components/ui";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function ImportsPage() {
  const imports = await prisma.importJob.findMany({ include: { book: true }, orderBy: { updatedAt: "desc" } });

  return (
    <>
      <PageHeader title="Imports" description="Completed downloads waiting for import, failed imports, and successful moves into library folders." />
      <Card>
        <div className="grid grid-cols-[1fr_100px_120px] border-b border-line px-4 py-3 text-xs font-medium uppercase tracking-wide text-slate-500">
          <span>Source</span>
          <span>Confidence</span>
          <span>Status</span>
        </div>
        <div className="divide-y divide-line">
          {imports.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-slate-500">No import jobs have been created.</div>
          ) : (
            imports.map((job) => (
              <div className="grid grid-cols-[1fr_100px_120px] items-center px-4 py-3" key={job.id}>
                <span className="min-w-0">
                  <span className="block truncate font-medium">{job.book.title}</span>
                  <span className="block truncate text-sm text-slate-500">{job.sourcePath}</span>
                </span>
                <span className="text-sm text-slate-300">{job.confidence ? `${job.confidence}%` : "Manual"}</span>
                <StatusPill tone={job.status === "failed" ? "rose" : job.status === "imported" ? "emerald" : "amber"}>{job.status}</StatusPill>
              </div>
            ))
          )}
        </div>
      </Card>
    </>
  );
}
