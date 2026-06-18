import { SettingsForm } from "@/components/settings-form";
import { PageHeader } from "@/components/ui";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const settings = await getSettings();

  return (
    <>
      <PageHeader title="Settings" description="Configure media paths, download clients, Prowlarr, Audiobookshelf, and import rules." />
      <SettingsForm settings={settings} />
    </>
  );
}
