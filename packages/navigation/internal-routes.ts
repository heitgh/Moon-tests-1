export const MOON_SETTINGS_SECTIONS = ["settings", "all", "appearance", "themes", "home", "sidebar", "workspaces", "search", "privacy", "advanced"] as const;
export type MoonSettingsSection = typeof MOON_SETTINGS_SECTIONS[number];

export function normalizeMoonInternalUrl(input: string): string | null {
  if (input === "moon://newtab" || input === "about:blank") return "moon://newtab";
  try {
    const url = new URL(input); if (url.protocol !== "moon:" || url.hostname !== "settings" || url.username || url.password || url.port || url.search || url.hash) return null;
    const section = url.pathname.replace(/^\/+|\/+$/g, "") || "settings";
    return MOON_SETTINGS_SECTIONS.includes(section as MoonSettingsSection) ? `moon://settings/${section}` : null;
  } catch { return null; }
}

export function isMoonSettingsUrl(input: string): boolean { return normalizeMoonInternalUrl(input)?.startsWith("moon://settings/") === true; }
