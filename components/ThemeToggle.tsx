"use client";
import { useEffect, useState } from "react";
import { useUser } from "@/lib/useUser";
import { THEME_STORAGE_KEY, parseTheme, type Theme } from "@/lib/theme";

/** Theme toggle: dark (default) / light. Persists to user_settings when
 * signed in (best effort — a failed DB write never blocks the toggle)
 * and always to localStorage, which logged-out pages fall back to. */
export default function ThemeToggle() {
  const { user, sb } = useUser();
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    let cancelled = false;
    const stored = parseTheme(
      typeof window !== "undefined" ? window.localStorage.getItem(THEME_STORAGE_KEY) : null,
    );
    if (sb && user) {
      (async () => {
        try {
          const { data } = await sb
            .from("user_settings")
            .select("theme")
            .eq("user_id", user.id)
            .single();
          if (cancelled) return;
          const dbTheme = parseTheme((data as { theme?: unknown } | null)?.theme);
          // A saved DB theme wins over localStorage; otherwise keep local.
          const next = data ? dbTheme : stored;
          setTheme(next);
          document.documentElement.dataset.theme = next;
        } catch {
          if (!cancelled) {
            setTheme(stored);
            document.documentElement.dataset.theme = stored;
          }
        }
      })();
    } else {
      setTheme(stored);
      document.documentElement.dataset.theme = stored;
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  async function change(next: Theme) {
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      /* storage unavailable — theme still applies for this session */
    }
    if (sb && user) {
      // Best effort only; failures are silent by design.
      try {
        await sb.from("user_settings").upsert({ user_id: user.id, theme: next }, { onConflict: "user_id" });
      } catch {
        /* localStorage already saved the choice */
      }
    }
  }

  return (
    <span style={{ display: "inline-flex", gap: ".4rem", alignItems: "center" }}>
      <label htmlFor="theme-toggle" className="muted" style={{ margin: 0, fontSize: ".9rem" }}>
        Theme
      </label>
      <select
        id="theme-toggle"
        className="input"
        style={{ width: "auto", minHeight: "2.4rem", padding: ".4rem .7rem" }}
        value={theme}
        onChange={(e) => change(parseTheme(e.target.value))}
        aria-label="Colour theme"
      >
        <option value="dark">Dark</option>
        <option value="light">Light</option>
      </select>
    </span>
  );
}
