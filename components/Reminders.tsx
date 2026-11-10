"use client";
import { useCallback, useEffect, useState } from "react";
import { useUser } from "@/lib/useUser";

const ENABLED_KEY = "edith-reminders-enabled";
const NOTIFIED_KEY = "edith-reminders-notified";

/**
 * In-app task reminders via browser notifications.
 *
 * Permission is requested ONLY after the user taps "Enable reminders" —
 * never silently. While the app is open it checks every minute for tasks
 * whose reminder time has arrived and not yet been notified (notified ids
 * are tracked in localStorage) and shows:
 *   "Time to start: <title> — <place>, at <time>"
 * Honest limit: this only fires while the app is open in a tab — there is
 * no push server on the free plan, so closed-tab reminders are not sent.
 * The Tasks page and dashboard also list upcoming reminders in the UI.
 */
export default function Reminders() {
  const { user, sb } = useUser();
  const [permission, setPermission] = useState<string>("default");
  const [enabled, setEnabled] = useState(false);
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    setSupported(typeof window !== "undefined" && "Notification" in window);
    if (typeof window !== "undefined" && "Notification" in window) setPermission(Notification.permission);
    try { setEnabled(localStorage.getItem(ENABLED_KEY) === "1"); } catch { /* storage unavailable */ }
  }, []);

  const check = useCallback(async () => {
    if (!sb || !user || !("Notification" in window) || Notification.permission !== "granted") return;
    const { data } = await sb.from("tasks").select("id,title,place,reminder_at").neq("status", "done").not("reminder_at", "is", null);
    if (!data) return;
    let notified: string[] = [];
    try { notified = JSON.parse(localStorage.getItem(NOTIFIED_KEY) || "[]") as string[]; } catch { notified = []; }
    const now = Date.now();
    let changed = false;
    for (const t of data as { id: string; title: string; place?: string | null; reminder_at: string }[]) {
      if (!t.reminder_at || Date.parse(t.reminder_at) > now || notified.includes(t.id)) continue;
      const when = new Date(t.reminder_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      try {
        new Notification(`Time to start: ${t.title}`, {
          body: `${t.place ? `${t.place} · ` : ""}at ${when}`,
          tag: `edith-task-${t.id}`,
        });
      } catch { /* notifications blocked */ }
      notified.push(t.id);
      changed = true;
    }
    if (changed) { try { localStorage.setItem(NOTIFIED_KEY, JSON.stringify(notified)); } catch { /* ignore */ } }
  }, [sb, user]);

  useEffect(() => {
    if (!enabled || permission !== "granted") return;
    check();
    const t = setInterval(check, 60 * 1000);
    return () => clearInterval(t);
  }, [enabled, permission, check]);

  async function enable() {
    if (!("Notification" in window)) return;
    const p = await Notification.requestPermission();
    setPermission(p);
    if (p === "granted") {
      try { localStorage.setItem(ENABLED_KEY, "1"); } catch { /* ignore */ }
      setEnabled(true);
    }
  }

  if (!supported || !user) return null;
  if (enabled && permission === "granted") return null;
  if (permission === "denied") {
    return (
      <button
        type="button"
        title="Reminders are blocked for this site — allow notifications in your browser's site settings to turn them on. They only fire while the app is open."
        style={{ position: "fixed", right: 12, bottom: 12, zIndex: 50, opacity: 0.7 }}
        className="btn btn-secondary"
        onClick={() => alert("Notifications are blocked for this site. Allow them in your browser's site settings (padlock/site icon → Site settings → Notifications), then reload.")}
      >
        🔔 Reminders blocked
      </button>
    );
  }
  return (
    <button
      type="button"
      title="Get a browser notification when a task's reminder time arrives. Only works while the app is open."
      style={{ position: "fixed", right: 12, bottom: 12, zIndex: 50 }}
      className="btn btn-secondary"
      onClick={enable}
    >
      🔔 Enable task reminders
    </button>
  );
}
