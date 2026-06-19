"use client";

import { CheckCircle2, ChevronLeft, Copy, Download, Folder, KeyRound, Plug, Plus, RefreshCw, Save, Server, Trash2, XCircle } from "lucide-react";
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

const pathFields = new Set(["booksPath", "audiobooksPath", "downloadsPath"]);

type DirectoryBrowserState = {
  field: string;
  label: string;
  path: string;
  parent: string | null;
  roots: string[];
  directories: Array<{ name: string; path: string }>;
  status: "loading" | "ready" | "error";
  error?: string;
};

type AppUpdateStatus = {
  available: boolean;
  canRunUpdater: boolean;
  currentCommit: string | null;
  currentMessage: string | null;
  remoteCommit: string | null;
  remoteMessage: string | null;
  branch: string;
  version: string;
  behindBy: number;
  aheadBy: number;
  checkedAt: string;
  updateScript: string | null;
  logTail: string | null;
  error?: string;
};

type ApiKeyRecord = {
  id: string;
  name: string;
  token: string;
  scope: string;
  createdAt: string;
  lastUsedAt: string | null;
};

export function SettingsForm({ apiKeys: initialApiKeys, settings }: { apiKeys: ApiKeyRecord[]; settings: Record<string, string> }) {
  const [values, setValues] = useState<Record<string, string>>({ ...defaultSettings, ...settings });
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [testStatus, setTestStatus] = useState<Record<string, string>>({});
  const [health, setHealth] = useState<Record<string, { state: "checking" | "connected" | "failed" | "not_configured"; message: string }>>({});
  const [scanStatus, setScanStatus] = useState<string | null>(null);
  const [directoryBrowser, setDirectoryBrowser] = useState<DirectoryBrowserState | null>(null);
  const [updateStatus, setUpdateStatus] = useState<AppUpdateStatus | null>(null);
  const [updateMessage, setUpdateMessage] = useState<string | null>(null);
  const [updateLoading, setUpdateLoading] = useState(false);
  const [apiKeys, setApiKeys] = useState<ApiKeyRecord[]>(initialApiKeys);
  const [newApiKeyName, setNewApiKeyName] = useState("");
  const [newApiKeyScope, setNewApiKeyScope] = useState("homepage");
  const [apiKeyStatus, setApiKeyStatus] = useState<string | null>(null);

  useEffect(() => {
    void refreshHealth();
    void refreshUpdateStatus();
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

  async function refreshUpdateStatus() {
    setUpdateLoading(true);
    setUpdateMessage(null);
    try {
      const response = await fetch("/api/app/update", { cache: "no-store" });
      const data = (await response.json()) as AppUpdateStatus;
      setUpdateStatus(data);
    } catch {
      setUpdateMessage("Update check failed.");
    } finally {
      setUpdateLoading(false);
    }
  }

  async function runUpdate() {
    setUpdateLoading(true);
    setUpdateMessage("Starting update...");
    try {
      const response = await fetch("/api/app/update", { method: "POST" });
      const data = (await response.json()) as { ok?: boolean; message?: string };
      setUpdateMessage(data.message ?? (response.ok ? "Update started." : "Update failed to start."));
      if (response.ok) {
        setUpdateStatus((current) => (current ? { ...current, available: false } : current));
      }
    } catch {
      setUpdateMessage("Update failed to start.");
    } finally {
      setUpdateLoading(false);
    }
  }

  async function createApiKey() {
    const name = newApiKeyName.trim();
    if (!name) {
      setApiKeyStatus("Name is required.");
      return;
    }

    const response = await fetch("/api/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, scope: newApiKeyScope })
    });
    const data = (await response.json()) as { apiKey?: ApiKeyRecord; error?: string };
    if (!response.ok || !data.apiKey) {
      setApiKeyStatus(data.error ?? "API key creation failed.");
      return;
    }

    setApiKeys((current) => [data.apiKey as ApiKeyRecord, ...current]);
    setNewApiKeyName("");
    setApiKeyStatus(`Created ${data.apiKey.name}.`);
  }

  async function deleteApiKey(id: string) {
    const response = await fetch(`/api/api-keys?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!response.ok) {
      setApiKeyStatus("API key delete failed.");
      return;
    }

    setApiKeys((current) => current.filter((apiKey) => apiKey.id !== id));
    setApiKeyStatus("API key deleted.");
  }

  async function copyApiKey(token: string) {
    await navigator.clipboard.writeText(token);
    setApiKeyStatus("API key copied.");
  }

  async function openDirectoryBrowser(field: string, label: string, nextPath = values[field] || "/mnt") {
    setDirectoryBrowser({
      field,
      label,
      path: nextPath,
      parent: null,
      roots: [],
      directories: [],
      status: "loading"
    });

    const response = await fetch(`/api/filesystem/directories?path=${encodeURIComponent(nextPath)}`);
    const data = (await response.json()) as Omit<DirectoryBrowserState, "field" | "label" | "status"> & { error?: string };

    setDirectoryBrowser({
      field,
      label,
      path: data.path ?? nextPath,
      parent: data.parent ?? null,
      roots: data.roots ?? [],
      directories: data.directories ?? [],
      status: response.ok ? "ready" : "error",
      error: data.error
    });
  }

  function selectDirectory() {
    if (!directoryBrowser) return;
    setValues((current) => ({ ...current, [directoryBrowser.field]: directoryBrowser.path }));
    setDirectoryBrowser(null);
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
      <Card className="p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-sm font-semibold text-slate-100">App Update</h2>
              {updateStatus ? (
                <StatusPill tone={updateStatus.error ? "rose" : updateStatus.available ? "amber" : "emerald"}>
                  {updateStatus.error ? "Check failed" : updateStatus.available ? "Update available" : "Up to date"}
                </StatusPill>
              ) : (
                <StatusPill>Not checked</StatusPill>
              )}
            </div>
            <p className="mt-1 text-xs text-slate-500">Compare this install against the configured git branch and run the BookBridge updater.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button disabled={updateLoading} onClick={() => void refreshUpdateStatus()} type="button" variant="secondary">
              <RefreshCw size={16} />
              Check
            </Button>
            {updateStatus?.available ? (
              <Button disabled={updateLoading || !updateStatus.canRunUpdater} onClick={() => void runUpdate()} type="button">
                <Download size={16} />
                Update App
              </Button>
            ) : null}
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <UpdateDetail label="Installed" commit={updateStatus?.currentCommit} message={updateStatus?.currentMessage} />
          <UpdateDetail label={`Remote ${updateStatus?.branch ?? "main"}`} commit={updateStatus?.remoteCommit} message={updateStatus?.remoteMessage} />
        </div>

        <div className="mt-3 text-xs leading-5 text-slate-400">
          {updateStatus ? (
            <p>
              Version {updateStatus.version} | Behind {updateStatus.behindBy} | Ahead {updateStatus.aheadBy}
              {!updateStatus.canRunUpdater ? " | Updater unavailable on this environment" : ""}
            </p>
          ) : null}
          {updateStatus?.error ? <p className="mt-2 text-rose-300">{updateStatus.error}</p> : null}
          {updateMessage ? <p className="mt-2 text-[#F1D48A]">{updateMessage}</p> : null}
          {updateStatus?.logTail ? (
            <details className="mt-3">
              <summary className="cursor-pointer text-slate-300">Last update log</summary>
              <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded border border-line bg-black/20 p-3 text-[11px] leading-5 text-slate-300">
                {updateStatus.logTail}
              </pre>
            </details>
          ) : null}
        </div>
      </Card>
      <Card className="p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <KeyRound className="text-[#F1D48A]" size={18} />
              <h2 className="text-sm font-semibold text-slate-100">API Access</h2>
            </div>
            <p className="mt-1 text-xs text-slate-500">Create named API keys for Homepage and future integrations.</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-[minmax(180px,1fr)_150px_auto]">
            <input
              className={inputClass}
              onChange={(event) => setNewApiKeyName(event.target.value)}
              placeholder="Key name"
              type="text"
              value={newApiKeyName}
            />
            <select className={inputClass} onChange={(event) => setNewApiKeyScope(event.target.value)} value={newApiKeyScope}>
              <option value="homepage">Homepage</option>
              <option value="general">General</option>
            </select>
            <Button onClick={() => void createApiKey()} type="button">
              <Plus size={16} />
              Create
            </Button>
          </div>
        </div>

        <div className="mt-4 overflow-hidden rounded border border-line">
          {apiKeys.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-slate-500">No API keys have been created.</div>
          ) : (
            <div className="divide-y divide-line">
              {apiKeys.map((apiKey) => (
                <div className="grid gap-3 px-4 py-3 lg:grid-cols-[1fr_120px_1.3fr_auto] lg:items-center" key={apiKey.id}>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-slate-100">{apiKey.name}</div>
                    <div className="mt-1 text-xs text-slate-500">Created {formatDate(apiKey.createdAt)}</div>
                  </div>
                  <StatusPill tone={apiKey.scope === "homepage" ? "cyan" : "slate"}>{apiKey.scope}</StatusPill>
                  <code className="block truncate rounded border border-line bg-black/20 px-2 py-1 text-xs text-slate-300">{apiKey.token}</code>
                  <div className="flex justify-start gap-2 lg:justify-end">
                    <Button className="h-8 w-8 px-0" onClick={() => void copyApiKey(apiKey.token)} title="Copy API key" type="button" variant="secondary">
                      <Copy size={15} />
                    </Button>
                    <Button className="h-8 w-8 px-0" onClick={() => void deleteApiKey(apiKey.id)} title="Delete API key" type="button" variant="secondary">
                      <Trash2 size={15} />
                    </Button>
                  </div>
                  {apiKey.lastUsedAt ? <div className="text-xs text-slate-500 lg:col-span-4">Last used {formatDate(apiKey.lastUsedAt)}</div> : null}
                </div>
              ))}
            </div>
          )}
        </div>
        {values.homepageApiKey ? (
          <p className="mt-3 text-xs text-slate-500">Legacy Homepage key is still accepted. Create named keys above for new integrations.</p>
        ) : null}
        {apiKeyStatus ? <p className="mt-3 text-xs text-[#F1D48A]">{apiKeyStatus}</p> : null}
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
                  <div className="flex gap-2">
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
                    {pathFields.has(key) ? (
                      <Button
                        aria-label={`Browse for ${label}`}
                        className="h-10 w-10 shrink-0 px-0"
                        onClick={() => void openDirectoryBrowser(key, label)}
                        title={`Browse for ${label}`}
                        type="button"
                        variant="secondary"
                      >
                        <Folder size={17} />
                      </Button>
                    ) : null}
                  </div>
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
      {directoryBrowser ? (
        <DirectoryBrowserModal
          browser={directoryBrowser}
          onClose={() => setDirectoryBrowser(null)}
          onNavigate={(nextPath) => void openDirectoryBrowser(directoryBrowser.field, directoryBrowser.label, nextPath)}
          onSelect={selectDirectory}
        />
      ) : null}
    </form>
  );
}

function DirectoryBrowserModal({
  browser,
  onClose,
  onNavigate,
  onSelect
}: {
  browser: DirectoryBrowserState;
  onClose: () => void;
  onNavigate: (path: string) => void;
  onSelect: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6">
      <div className="w-full max-w-2xl overflow-hidden rounded border border-line bg-panel shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-line px-4 py-3">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-slate-100">Select {browser.label}</h3>
            <p className="mt-1 break-all text-xs text-slate-500">{browser.path}</p>
          </div>
          <Button onClick={onClose} type="button" variant="secondary">
            Close
          </Button>
        </div>

        <div className="border-b border-line px-4 py-3">
          <div className="flex flex-wrap gap-2">
            {browser.parent ? (
              <Button onClick={() => onNavigate(browser.parent ?? "/")} type="button" variant="secondary">
                <ChevronLeft size={16} />
                Parent
              </Button>
            ) : null}
            {browser.roots.map((root) => (
              <Button key={root} onClick={() => onNavigate(root)} type="button" variant="secondary">
                {root}
              </Button>
            ))}
          </div>
        </div>

        <div className="max-h-[50vh] overflow-y-auto p-2">
          {browser.status === "loading" ? <div className="px-3 py-8 text-center text-sm text-slate-500">Loading folders...</div> : null}
          {browser.status === "error" ? <div className="px-3 py-8 text-center text-sm text-rose-300">{browser.error ?? "Unable to read folder."}</div> : null}
          {browser.status === "ready" && browser.directories.length === 0 ? (
            <div className="px-3 py-8 text-center text-sm text-slate-500">No child folders found.</div>
          ) : null}
          {browser.status === "ready"
            ? browser.directories.map((directory) => (
                <button
                  className="flex w-full items-center gap-3 rounded px-3 py-2 text-left text-sm text-slate-200 transition hover:bg-white/[0.05]"
                  key={directory.path}
                  onClick={() => onNavigate(directory.path)}
                  type="button"
                >
                  <Folder className="shrink-0 text-[#F1D48A]" size={17} />
                  <span className="min-w-0 truncate">{directory.name}</span>
                </button>
              ))
            : null}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-line px-4 py-3">
          <Button onClick={onClose} type="button" variant="secondary">
            Cancel
          </Button>
          <Button onClick={onSelect} type="button">
            Use This Folder
          </Button>
        </div>
      </div>
    </div>
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

function UpdateDetail({ label, commit, message }: { label: string; commit?: string | null; message?: string | null }) {
  return (
    <div className="rounded border border-line bg-panel p-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="rounded border border-line bg-black/20 px-2 py-1 font-mono text-xs text-[#F1D48A]">{commit ?? "unknown"}</span>
      </div>
      <p className="mt-2 min-h-5 truncate text-sm text-slate-300" title={message ?? undefined}>
        {message ?? "No commit message available."}
      </p>
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}
