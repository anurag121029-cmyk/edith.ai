/**
 * Theme handling (light / dark). Dark is the default.
 *
 * Persistence, in priority order:
 *  1. Signed-in users: `user_settings.theme` (migration 0003, owner-only RLS,
 *     check constraint allows only 'dark' | 'light'). The toggle upserts it.
 *  2. Everyone else (including logged-out pages): localStorage key
 *     `edith-theme`. This is also the fallback when the DB write fails.
 *
 * Pure helpers here are unit-tested; the browser/DOM parts live in
 * components/ThemeToggle.tsx so this module stays importable in tests.
 */
export type Theme = "dark" | "light";
export const THEME_STORAGE_KEY = "edith-theme";

export function parseTheme(value: unknown): Theme {
  return value === "light" ? "light" : "dark";
}

/** Safe localStorage read (returns dark on the server / on any error). */
export function themeFromStorage(storage: { getItem: (k: string) => string | null } | null): Theme {
  try {
    return parseTheme(storage?.getItem(THEME_STORAGE_KEY) ?? null);
  } catch {
    return "dark";
  }
}
