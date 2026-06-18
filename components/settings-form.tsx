"use client";

import { CheckCircle2, KeyRound, Plug, RefreshCw, Save, Server, XCircle } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { Button, Card, inputClass, StatusPill } from "@/components/ui";
import { defaultSettings } from "@/lib/default-settings";

const groups = [
  {
    title: "Media Paths",
    fields: [
      ["booksPath", "Books path"],
      ["audiobooksPath", "Audiobooks path"],
      ["downloadsPath", "Downloads path"]
    ]
  },
  {
    title: "Prowlarr",
    fields: [
      ["prowlarrUrl", "URL"],
      ["prowlarrApiKey", "API key"],
      ["prowlarrEbookCategories", "Ebook categories"],
      ["prowlarrAudiobookCategories", "Audiobook categories"]
    ]
  },
  {
    title: "Hardcover",
    fields: [
      ["hardcoverEnabled", "Enabled"],
      ["hardcoverEndpoint", "GraphQL endpoint"],
      ["hardcoverApiKey", "API key"]
    ]
  },
  {
    title: "SABnzbd",
    fields: [
      ["sabEnabled", "Enabled"],
      ["sabUrl", "URL"],
      ["sabApiKey", "API key"],
      ["sabEbookCategory", "Ebook category"],
      ["sabAudiobookCategory", "Audiobook category"]
    ]
  },
  {
    title: "qBittorrent",
    fields: [
      ["qbittorrentEnabled", "Enabled"],
      ["qbittorrentUrl", "URL"],
      ["qbittorrentUsername", "Username"],
      ["qbittorrentPassword", "Password"],
      ["qbittorrentEbookCategory", "Ebook category"],
      ["qbittorrentAudiobookCategory", "Audiobook category"]
    ]
  },
  {
    title: "Audiobookshelf",
    fields: [
      ["audiobookshelfUrl", "URL"],
      ["audiobookshelfApiKey", "API key"]
    ]
  },
  {
    title: "Homepage",
    fields: [
      ["homepageApiKey", "API key"]
    ]
  },
  {
    title: "Import Settings",
    fields: [
      ["autoImportThreshold", "Auto import threshold"],
      ["autoRequestThreshold", "Auto request threshold"],
      ["manualReviewThreshold", "Manual review threshold"],
      ["importMode", "Import mode"],
      ["deleteSourceFilesAfterImport", "Delete source files after import"],
      ["allowOverwrite", "Allow overwrite"],
      ["ignoreSamples", "Ignore samples"],
      ["ignoreExtras", "Ignore extras"],
      ["pollingIntervalSeconds", "Polling interval seconds"]
    ]
  }
] as const;

const healthServices = [
  { key: "prowlarr", label: "Prowlarr", description: "Indexer search" },
  { key: "sabnzbd", label: "SABnzbd", description: "Usenet downloads" },
  { key: "qbittorrent", label: "qBittorrent", description: "Torrent downloads" }
] as const;

const booleanFields = new Set([
  "sabEnabled",
  "qbittorrentEnabled",
  "hardcoverEnabled",
  "deleteSourceFilesAfterImport",
  "allowOverwrite",
  "ignoreSamples",
  "ignoreExtras"
]);

export function SettingsForm({ settings }: { settings: Record<string, string> }) {
  const [values, setValues] = useState<Record<string, string>>({ ...defaultSettings, ...settings });
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [testStatus, setTestStatus] = useState<Record<string, string>>({});
  const [health, setHealth] = useState<Record<string, { state: "checking" | "connected" | "failed" | "not_configured"; message: string }>>({});
  const [scanStatus, setScanStatus] = useState<string | null>(null);

  useEffect(() => {
    void refreshHealth();
    // Run only once on initial Settings load. Manual refresh handles later edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("saving");
    const response = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values)
    });
    if (!response.ok) {
      setStatus("error");
      return;
    }
    const data = (await response.json()) as { settings: Record<string, string> };
    setValues({ ...defaultSettings, ...data.settings });
    setStatus("saved");
  }

  async function testConnection(service: string) {
    setTestStatus((current) => ({ ...current, [service]: "Testing..." }));
    setHealth((current) => ({ ...current, [service]: { state: "checking", message: "Checking..." } }));
    const response = await fetch(`/api/settings/test/${service}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values)
    });
    const data = await response.json();
    const message = data.ok ? "Connected" : data.message ?? "Connection failed";
    setTestStatus((current) => ({ ...current, [service]: message }));
    setHealth((current) => ({
      ...current,
      [service]: {
        state: data.ok ? "connected" : isMissingConfigMessage(message) ? "not_configured" : "failed",
        message
      }
    }));
  }

  async function refreshHealth() {
    await Promise.all(healthServices.map((service) => testConnection(service.key)));
  }

  async function scanLibrary() {
    setScanStatus("Scanning library paths...");
    const response = await fetch("/api/library/scan", { method: "POST" });
    const data = await response.json();
    if (!response.ok) {
      setScanStatus(data.error ?? "Library scan failed.");
      return;
    }
    setScanStatus(data.errors?.length ? `Scanned ${data.count} items with ${data.errors.length} path errors.` : `Scanned ${data.count} library items.`);
  }

  function generateHomepageApiKey() {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    const token = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    setValues((current) => ({ ...current, homepageApiKey: `bb_${token}` }));
    setStatus("idle");
  }

  return (
    <form className="grid gap-4" onSubmit={submit}>
      <Card className="p-4">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-100">Connection Health</h2>
            <p className="mt-1 text-xs text-slate-500">Current status for services used by requests and downloads.</p>
          </div>
          <Button onClick={() => void refreshHealth()} type="button" variant="secondary">
            <RefreshCw size={16} />
            Refresh
          </Button>
          <Button onClick={() => void scanLibrary()} type="button">
            <RefreshCw size={16} />
            Scan Library
          </Button>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {healthServices.map((service) => (
            <HealthCard
              description={service.description}
              key={service.key}
              label={service.label}
              message={health[service.key]?.message ?? "Not checked"}
              state={health[service.key]?.state ?? "checking"}
            />
          ))}
        </div>
        {scanStatus ? <p className="mt-3 text-xs text-slate-400">{scanStatus}</p> : null}
      </Card>
      {groups.map((group) => (
        <Card key={group.title}>
          <div className="border-b border-line px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-slate-100">{group.title}</h2>
              {["Prowlarr", "SABnzbd", "qBittorrent"].includes(group.title) ? (
                <div className="flex items-center gap-2">
                  {testStatus[serviceKey(group.title)] ? <StatusPill>{testStatus[serviceKey(group.title)]}</StatusPill> : null}
                  <Button onClick={() => void testConnection(serviceKey(group.title))} type="button" variant="secondary">
                    <Plug size={16} />
                    Test Connection
                  </Button>
                </div>
              ) : null}
              {group.title === "Homepage" ? (
                <Button onClick={generateHomepageApiKey} type="button" variant="secondary">
                  <KeyRound size={16} />
                  Generate Key
                </Button>
              ) : null}
            </div>
          </div>
          <div className="grid gap-4 p-4 md:grid-cols-2">
            {group.fields.map(([key, label]) => (
              <label className="grid gap-2 text-sm text-slate-300" key={key}>
                {label}
                {booleanFields.has(key) ? (
                  <select
                    className={inputClass}
                    name={key}
                    onChange={(event) => {
                      setValues((current) => ({ ...current, [key]: event.target.value }));
                      setStatus("idle");
                    }}
                    value={values[key] === "true" ? "true" : "false"}
                  >
                    <option value="true">True</option>
                    <option value="false">False</option>
                  </select>
                ) : (
                  <input
                    className={inputClass}
                    name={key}
                    onChange={(event) => {
                      setValues((current) => ({ ...current, [key]: event.target.value }));
                      setStatus("idle");
                    }}
                    type={key.toLowerCase().includes("password") || key.toLowerCase().includes("apikey") ? "password" : "text"}
                    value={values[key] ?? ""}
                  />
                )}
              </label>
            ))}
          </div>
        </Card>
      ))}
      <div className="flex items-center gap-3">
        <Button disabled={status === "saving"} type="submit">
          <Save size={16} />
          Save Settings
        </Button>
        {status === "saved" && <StatusPill tone="emerald">Saved</StatusPill>}
        {status === "error" && <StatusPill tone="rose">Save failed</StatusPill>}
      </div>
    </form>
  );
}

function serviceKey(title: string) {
  if (title === "SABnzbd") return "sabnzbd";
  if (title === "qBittorrent") return "qbittorrent";
  return title.toLowerCase();
}

function isMissingConfigMessage(message: string) {
  return /missing|disabled|required/i.test(message);
}

function HealthCard({
  label,
  description,
  state,
  message
}: {
  label: string;
  description: string;
  state: "checking" | "connected" | "failed" | "not_configured";
  message: string;
}) {
  const Icon = state === "connected" ? CheckCircle2 : state === "failed" ? XCircle : Server;
  const tone = state === "connected" ? "emerald" : state === "failed" ? "rose" : state === "not_configured" ? "amber" : "slate";
  const labelText = state === "connected" ? "Connected" : state === "failed" ? "Failed" : state === "not_configured" ? "Not configured" : "Checking";

  return (
    <div className="rounded border border-line bg-panel p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
            <Icon className={state === "connected" ? "text-emerald-300" : state === "failed" ? "text-rose-300" : "text-slate-500"} size={18} />
            {label}
          </div>
          <p className="mt-1 text-xs text-slate-500">{description}</p>
        </div>
        <StatusPill tone={tone}>{labelText}</StatusPill>
      </div>
      <p className="mt-3 min-h-5 break-words text-xs leading-5 text-slate-400">{message}</p>
    </div>
  );
}
