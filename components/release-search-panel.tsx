"use client";

import { Download, RefreshCw, Search } from "lucide-react";
import { useState } from "react";
import { Button, Card, StatusPill } from "@/components/ui";
import { formatBytes } from "@/lib/utils";
import { scoreLabel } from "@/lib/scoring";

type Release = {
  id: string;
  title: string;
  indexer?: string | null;
  protocol: string;
  size?: string | number | bigint | null;
  age?: string | null;
  seeders?: number | null;
  category?: string | null;
  format?: string | null;
  score?: number | null;
  warnings?: string | null;
};

export function ReleaseSearchPanel({
  bookId,
  initialReleases,
  clients
}: {
  bookId: string;
  initialReleases: Release[];
  clients: { sabnzbd: boolean; qbittorrent: boolean };
}) {
  const [releases, setReleases] = useState(initialReleases);
  const [status, setStatus] = useState<string | null>(null);
  const [sendingReleaseIds, setSendingReleaseIds] = useState<Set<string>>(new Set());

  async function search(format: "ebook" | "audiobook") {
    setStatus(`Searching ${format} releases...`);
    const response = await fetch("/api/releases/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookId, format })
    });
    const data = await response.json();
    if (!response.ok) {
      setStatus(data.error ?? "Release search failed.");
      return;
    }
    setReleases(data.releases);
    setStatus(`Found ${data.releases.length} ${format} releases.`);
  }

  async function searchBoth() {
    await search("audiobook");
    const response = await fetch("/api/releases/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookId, format: "ebook" })
    });
    const data = await response.json();
    if (response.ok) setReleases((current) => [...current, ...data.releases]);
  }

  async function sendDownload(release: Release, client: "sabnzbd" | "qbittorrent") {
    setSendingReleaseIds((current) => new Set(current).add(release.id));
    setStatus(`Sending to ${client}...`);
    try {
      const response = await fetch("/api/downloads/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookId, releaseId: release.id, client, format: release.format ?? "audiobook" })
      });
      const data = await response.json();
      setStatus(response.ok ? data.message ?? `Sent to ${client}.` : data.error ?? `Failed to send to ${client}.`);
    } finally {
      setSendingReleaseIds((current) => {
        const next = new Set(current);
        next.delete(release.id);
        return next;
      });
    }
  }

  return (
    <Card className="min-w-0 overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-line px-4 py-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">Releases</h2>
          {status ? <p className="mt-1 max-w-3xl break-words text-xs leading-5 text-slate-500">{status}</p> : null}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button className="border-[#C89B3C]/35 text-[#F1D48A] hover:bg-[#C89B3C]/10" onClick={() => void search("ebook")} variant="secondary">
            <Search size={16} />
            Search Ebooks
          </Button>
          <Button className="border-[#7C3AED]/35 text-[#C4B5FD] hover:bg-[#7C3AED]/10" onClick={() => void search("audiobook")} variant="secondary">
            <Search size={16} />
            Search Audio
          </Button>
          <Button className="bg-gradient-to-r from-[#C89B3C] to-[#7C3AED] text-white hover:from-[#D4A64A] hover:to-[#8B5CF6]" onClick={() => void searchBoth()}>
            <RefreshCw size={16} />
            Search Both
          </Button>
        </div>
      </div>
      <div className="divide-y divide-line">
        {releases.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-slate-500">Search Prowlarr to load release results.</div>
        ) : (
          releases.map((release) => (
            <ReleaseRow clients={clients} isSending={sendingReleaseIds.has(release.id)} key={release.id} onSend={sendDownload} release={release} />
          ))
        )}
      </div>
    </Card>
  );
}

function ReleaseRow({
  release,
  clients,
  isSending,
  onSend
}: {
  release: Release;
  clients: { sabnzbd: boolean; qbittorrent: boolean };
  isSending: boolean;
  onSend: (release: Release, client: "sabnzbd" | "qbittorrent") => Promise<void>;
}) {
  const downloader = downloaderForProtocol(release.protocol);
  const enabled = downloader ? clients[downloader.client] : false;

  return (
    <div className="grid gap-4 px-4 py-4 text-sm hover:bg-white/[0.02] xl:grid-cols-[minmax(0,1fr)_270px_auto] xl:items-start">
      <div className="min-w-0">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <StatusPill tone={(release.score ?? 0) >= 75 ? "emerald" : (release.score ?? 0) >= 60 ? "amber" : "rose"}>
            {release.score ?? 0} {scoreLabel(release.score)}
          </StatusPill>
          <StatusPill tone={release.format === "audiobook" ? "purple" : "cyan"}>{release.format ?? "release"}</StatusPill>
          <span className="text-xs uppercase tracking-wide text-slate-500">{release.indexer ?? "Unknown indexer"}</span>
        </div>
        <div className="break-words font-medium leading-6 text-slate-100">{release.title}</div>
        {release.warnings ? <div className="mt-1 break-words text-xs leading-5 text-[#F1D48A]">{release.warnings}</div> : null}
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-4 xl:grid-cols-2">
        <ReleaseMeta label="Protocol" value={release.protocol} />
        <ReleaseMeta label="Size" value={formatBytes(release.size ? BigInt(release.size) : null)} />
        <ReleaseMeta label="Age" value={release.age ?? "Unknown" } />
        <ReleaseMeta label="Seeders" value={release.seeders?.toString() ?? "-"} />
        <div className="col-span-2 sm:col-span-4 xl:col-span-2">
          <dt className="text-slate-500">Category</dt>
          <dd className="mt-1 break-words text-slate-300">{release.category ?? release.format ?? "-"}</dd>
        </div>
      </dl>

      <div className="flex xl:justify-end">
        {downloader ? (
          <Button disabled={!enabled || isSending} onClick={() => void onSend(release, downloader.client)} title={enabled ? `Send to ${downloader.label}` : `${downloader.label} is not configured`}>
            <Download size={16} />
            {isSending ? "Sending..." : downloader.label}
          </Button>
        ) : (
          <Button disabled variant="secondary">
            <Download size={16} />
            No client
          </Button>
        )}
      </div>
    </div>
  );
}

function ReleaseMeta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-slate-500">{label}</dt>
      <dd className="mt-1 break-words text-slate-300">{value}</dd>
    </div>
  );
}

function downloaderForProtocol(protocol: string): { client: "sabnzbd" | "qbittorrent"; label: string } | null {
  const normalized = protocol.toLowerCase();
  if (normalized === "usenet") return { client: "sabnzbd", label: "SAB" };
  if (normalized === "torrent") return { client: "qbittorrent", label: "qBit" };
  return null;
}
