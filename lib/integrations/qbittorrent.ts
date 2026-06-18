type Settings = Record<string, string>;

export async function testQbittorrent(settings: Settings) {
  if (!settings.qbittorrentUrl || !settings.qbittorrentUsername) {
    return { ok: false, message: "qBittorrent URL or username is missing." };
  }
  try {
    const cookie = await login(settings);
    return { ok: Boolean(cookie), message: cookie ? "Connected" : "Login failed" };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Connection failed" };
  }
}

export async function sendToQbittorrent({
  settings,
  downloadUrl,
  category,
  savePath
}: {
  settings: Settings;
  downloadUrl: string;
  category: string;
  savePath?: string;
}) {
  if (settings.qbittorrentEnabled !== "true") throw new Error("qBittorrent is disabled.");
  const cookie = await login(settings);
  if (!cookie) throw new Error("qBittorrent login failed.");

  const form = new URLSearchParams();
  form.set("urls", downloadUrl);
  form.set("category", category);
  if (savePath) form.set("savepath", savePath);

  const response = await fetch(new URL("/api/v2/torrents/add", normalizeBaseUrl(settings.qbittorrentUrl)), {
    method: "POST",
    headers: {
      Cookie: cookie,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: form,
    cache: "no-store"
  });

  if (!response.ok) throw new Error(`qBittorrent add failed with HTTP ${response.status}.`);
  return { jobId: null };
}

export async function fetchQbittorrentStatus(settings: Settings) {
  if (settings.qbittorrentEnabled !== "true") return [];
  const cookie = await login(settings);
  if (!cookie) return [];

  const response = await fetch(new URL("/api/v2/torrents/info", normalizeBaseUrl(settings.qbittorrentUrl)), {
    headers: { Cookie: cookie },
    cache: "no-store"
  });
  if (!response.ok) return [];
  const data = (await response.json()) as Array<Record<string, unknown>>;
  return data.map((item) => ({
    id: String(item.hash ?? ""),
    title: String(item.name ?? ""),
    status: mapState(String(item.state ?? "")),
    progress: Math.round(Number(item.progress ?? 0) * 100),
    path: item.save_path ? String(item.save_path) : undefined
  }));
}

async function login(settings: Settings) {
  if (!settings.qbittorrentUrl || !settings.qbittorrentUsername) return null;
  const form = new URLSearchParams();
  form.set("username", settings.qbittorrentUsername);
  form.set("password", settings.qbittorrentPassword ?? "");

  const response = await fetch(new URL("/api/v2/auth/login", normalizeBaseUrl(settings.qbittorrentUrl)), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
    cache: "no-store"
  });
  if (!response.ok) return null;
  return response.headers.get("set-cookie");
}

function mapState(state: string) {
  if (state.includes("upload") || state.includes("pausedUP")) return "completed";
  if (state.includes("downloading") || state.includes("metaDL") || state.includes("stalledDL")) return "downloading";
  if (state.includes("error") || state.includes("missing")) return "failed";
  return "queued";
}

function normalizeBaseUrl(value: string) {
  return value.endsWith("/") ? value : `${value}/`;
}
