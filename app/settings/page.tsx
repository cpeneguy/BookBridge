import { SettingsForm } from "@/components/settings-form";
import { PageHeader } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [settings, apiKeys] = await Promise.all([
    getSettings(),
    prisma.apiKey.findMany({ orderBy: { createdAt: "desc" } })
  ]);

  return (
    <>
      <PageHeader title="Settings" description="Configure media paths, download clients, Prowlarr, Audiobookshelf, and import rules." />
      <SettingsForm
        apiKeys={apiKeys.map((apiKey) => ({
          id: apiKey.id,
          name: apiKey.name,
          token: apiKey.token,
          scope: apiKey.scope,
          createdAt: apiKey.createdAt.toISOString(),
          lastUsedAt: apiKey.lastUsedAt?.toISOString() ?? null
        }))}
        settings={settings}
      />
    </>
  );
}
