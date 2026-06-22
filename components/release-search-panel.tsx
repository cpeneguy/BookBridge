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

type DownloadSummary = {
  releaseId?: string | null;
  category: string;
  status: string;
  client: string;
};

export function ReleaseSearchPanel({
  bookId,
  initialReleases,
  clients,
  downloads
}: {
  bookId: string;
  initialReleases: Release[];
  clients: { sabnzbd: boolean; qbittorrent: boolean };
  downloads: DownloadSummary[];
}) {
  const [releases, setReleases] = useState(initialReleases);
  const [status, setStatus] = useState<string | null>(null);
  const [sendingReleaseIds, setSendingReleaseIds] = useState<Set<string>>(new Set());
  const activeFormats = activeFormatsFromDownloads(downloads);
  const activeReleaseIds = new Set(downloads.filter((download) => download.status !== "failed" && download.releaseId).map((download) => String(download.releaseId)));

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
          <Button className="border-[#C89B3C]/35 text-[#F1D48A] hover:bg-[#C89B3C]/10" disabled={activeFormats.ebook} onClick={() => void search("ebook")} variant="secondary">
            <Search size={16} />
            {activeFormats.ebook ? "Ebook Sent" : "Search Ebooks"}
          </Button>
          <Button className="border-[#7C3AED]/35 text-[#C4B5FD] hover:bg-[#7C3AED]/10" disabled={activeFormats.audiobook} onClick={() => void search("audiobook")} variant="secondary">
            <Search size={16} />
            {activeFormats.audiobook ? "Audio Sent" : "Search Audio"}
          </Button>
          <Button className="bg-gradient-to-r from-[#C89B3C] to-[#7C3AED] text-white hover:from-[#D4A64A] hover:to-[#8B5CF6]" disabled={activeFormats.ebook && activeFormats.audiobook} onClick={() => void searchBoth()}>
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
            <ReleaseRow
              activeFormats={activeFormats}
              activeReleaseIds={activeReleaseIds}
              clients={clients}
              isSending={sendingReleaseIds.has(release.id)}
              key={release.id}
              onSend={sendDownload}
              release={release}
            />
          ))
        )}
      </div>
    </Card>
  );
}

function ReleaseRow({
  release,
  clients,
  activeFormats,
  activeReleaseIds,
  isSending,
  onSend
}: {
  release: Release;
  clients: { sabnzbd: boolean; qbittorrent: boolean };
  activeFormats: Record<"ebook" | "audiobook", boolean>;
  activeReleaseIds: Set<string>;
  isSending: boolean;
  onSend: (release: Release, client: "sabnzbd" | "qbittorrent") => Promise<void>;
}) {
  const downloader = downloaderForProtocol(release.protocol);
  const enabled = downloader ? clients[downloader.client] : false;
  const format = release.format === "audiobook" ? "audiobook" : "ebook";
  const formatAlreadySent = activeFormats[format];
  const releaseAlreadySent = activeReleaseIds.has(release.id);

  return (
    <div className="grid min-w-0 gap-3 px-4 py-4 text-sm hover:bg-white/[0.02]">
      <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <StatusPill tone={(release.score ?? 0) >= 75 ? "emerald" : (release.score ?? 0) >= 60 ? "amber" : "rose"}>
              {release.score ?? 0} {scoreLabel(release.score)}
            </StatusPill>
            <StatusPill tone={release.format === "audiobook" ? "purple" : "cyan"}>{release.format ?? "release"}</StatusPill>
            <span className="text-xs uppercase tracking-wide text-slate-500">{release.indexer ?? "Unknown indexer"}</span>
            {releaseAlreadySent ? <StatusPill tone="emerald">Sent</StatusPill> : formatAlreadySent ? <StatusPill tone="amber">{format} already sent</StatusPill> : null}
          </div>
          <div className="break-words font-medium leading-6 text-slate-100">{release.title}</div>
          {release.warnings ? <div className="mt-1 break-words text-xs leading-5 text-[#F1D48A]">{release.warnings}</div> : null}
        </div>
        <div className="flex shrink-0 lg:justify-end">
          {releaseAlreadySent || formatAlreadySent ? (
            <Button disabled variant="secondary">
              <Download size={16} />
              Sent
            </Button>
          ) : downloader ? (
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

      <dl className="grid min-w-0 grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-3 xl:grid-cols-5">
        <ReleaseMeta label="Protocol" value={release.protocol} />
        <ReleaseMeta label="Size" value={formatBytes(release.size ? BigInt(release.size) : null)} />
        <ReleaseMeta label="Age" value={release.age ?? "Unknown"} />
        <ReleaseMeta label="Seeders" value={release.seeders?.toString() ?? "-"} />
        <ReleaseMeta label="Category" value={release.category ?? release.format ?? "-"} />
      </dl>
    </div>
  );
}

function activeFormatsFromDownloads(downloads: DownloadSummary[]) {
  return downloads.reduce<Record<"ebook" | "audiobook", boolean>>(
    (formats, download) => {
      if (download.status === "failed") return formats;
      const category = download.category.toLowerCase();
      if (category.includes("audio")) {
        formats.audiobook = true;
      } else if (category.includes("ebook") || category.includes("book")) {
        formats.ebook = true;
      }
      return formats;
    },
    { ebook: false, audiobook: false }
  );
}

function ReleaseMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-slate-500">{label}</dt>
      <dd className="mt-1 truncate text-slate-300" title={value}>{value}</dd>
    </div>
  );
}

function downloaderForProtocol(protocol: string): { client: "sabnzbd" | "qbittorrent"; label: string } | null {
  const normalized = protocol.toLowerCase();
  if (normalized === "usenet") return { client: "sabnzbd", label: "SAB" };
  if (normalized === "torrent") return { client: "qbittorrent", label: "qBit" };
  return null;
}
