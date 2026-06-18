"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, StatusPill } from "@/components/ui";

export function DownloadRefreshButton() {
  const router = useRouter();
  const [status, setStatus] = useState<string | null>(null);

  async function refresh() {
    setStatus("Refreshing...");
    const response = await fetch("/api/downloads/sync", { method: "POST" });
    const data = await response.json();
    setStatus(response.ok ? `Updated ${data.updated ?? 0}` : "Refresh failed");
    router.refresh();
  }

  return (
    <div className="flex items-center gap-3">
      <Button onClick={() => void refresh()}>
        <RefreshCw size={16} />
        Refresh Status
      </Button>
      {status ? <StatusPill>{status}</StatusPill> : null}
    </div>
  );
}
