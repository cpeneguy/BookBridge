import { prisma } from "@/lib/prisma";
import { defaultSettings } from "@/lib/default-settings";

export async function getSettings() {
  const rows = await prisma.setting.findMany();
  return {
    ...defaultSettings,
    ...Object.fromEntries(rows.map((setting) => [setting.key, setting.value]))
  };
}

export async function saveSettings(values: Record<string, string>) {
  const allowedKeys = new Set(Object.keys(defaultSettings));
  const entries = Object.entries(values).filter(([key]) => allowedKeys.has(key));

  await prisma.$transaction(
    entries.map(([key, value]) =>
      prisma.setting.upsert({
        where: { key },
        update: { value },
        create: { key, value }
      })
    )
  );

  return getSettings();
}
