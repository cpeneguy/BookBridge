type Settings = Record<string, string>;

export async function testSabnzbd(settings: Settings) {
  if (!settings.sabUrl || !settings.sabApiKey) return { ok: false, message: "SABnzbd URL or API key is missing." };
  try {
    const url = sabUrl(settings, { mode: "version", output: "json" });
    const response = await fetch(url, { cache: "no-store" });
    return { ok: response.ok, message: response.ok ? "Connected" : `HTTP ${response.status}` };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Connection failed" };
  }
}

export async function sendToSabnzbd({
  settings,
  downloadUrl,
  category
}: {
  settings: Settings;
  downloadUrl: string;
  category: string;
}) {
  if (settings.sabEnabled !== "true") throw new Error("SABnzbd is disabled.");
  if (!settings.sabUrl || !settings.sabApiKey) throw new Error("SABnzbd URL and API key are required.");

  const url = sabUrl(settings, {
    mode: "addurl",
    name: downloadUrl,
    cat: category,
    output: "json"
  });
  const response = await fetch(url, { cache: "no-store" });
  const data = await response.json().catch(() => ({}));

  if (!response.ok || data.status === false) {
    throw new Error(data.error || `SABnzbd addurl failed with HTTP ${response.status}.`);
  }

  return {
    jobId: data.nzo_ids?.[0] ?? data.nzo_id ?? null,
    raw: data
  };
}

export async function fetchSabnzbdStatus(settings: Settings) {
  if (settings.sabEnabled !== "true" || !settings.sabUrl || !settings.sabApiKey) return [];
  const [queueResponse, historyResponse] = await Promise.all([
    fetch(sabUrl(settings, { mode: "queue", output: "json" }), { cache: "no-store" }),
    fetch(sabUrl(settings, { mode: "history", output: "json" }), { cache: "no-store" })
  ]);
  const queue = queueResponse.ok ? await queueResponse.json() : {};
  const history = historyResponse.ok ? await historyResponse.json() : {};
  return [
    ...((queue.queue?.slots ?? []) as Array<Record<string, unknown>>).map((item) => ({
      id: String(item.nzo_id ?? ""),
      title: String(item.filename ?? item.name ?? ""),
      status: "downloading",
      progress: Number(item.percentage ?? 0)
    })),
    ...((history.history?.slots ?? []) as Array<Record<string, unknown>>).map((item) => ({
      id: String(item.nzo_id ?? ""),
      title: String(item.name ?? ""),
      status: String(item.status ?? "").toLowerCase() === "completed" ? "completed" : "failed",
      progress: String(item.status ?? "").toLowerCase() === "completed" ? 100 : undefined,
      path: item.storage ? String(item.storage) : undefined,
      error: item.fail_message ? String(item.fail_message) : undefined
    }))
  ];
}

function sabUrl(settings: Settings, params: Record<string, string>) {
  const url = new URL("/api", normalizeBaseUrl(settings.sabUrl));
  url.searchParams.set("apikey", settings.sabApiKey);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  return url;
}

function normalizeBaseUrl(value: string) {
  return value.endsWith("/") ? value : `${value}/`;
}
