"use client";
import { useCallback, useEffect, useState } from "react";
import { useUser } from "@/lib/useUser";

const ENABLED_KEY = "edith-reminders-enabled";
const NOTIFIED_KEY = "edith-reminders-notified";

/**
 * In-app task reminders via browser notifications.
 *
 * Permission is requested ONLY after the user taps "Enable reminders" —
 * never silently. While the app is open it checks every minute for:
 *  (a) tasks whose reminder time has arrived (once ever per task), and
 *  (b) tasks whose start time has passed while still not done — the
 *      "you forgot this task" nudge, once per task per day (tracked as
 *      "<taskId>:<date>" in localStorage, so it never spams).
 * Honest limit: this only fires while the app is open in a tab — there is
 * no push server on the free plan, so closed-tab reminders are not sent.
 * The Tasks page and dashboard also list upcoming and pending reminders
 * in the UI.
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
    const { data } = await sb.from("tasks").select("id,title,place,reminder_at,start_time").neq("status", "done").or("reminder_at.not.is.null,start_time.not.is.null");
    if (!data) return;
    let notified: string[] = [];
    try { notified = JSON.parse(localStorage.getItem(NOTIFIED_KEY) || "[]") as string[]; } catch { notified = []; }
    const now = Date.now();
    const today = new Date().toISOString().slice(0, 10);
    let changed = false;
    for (const t of data as { id: string; title: string; place?: string | null; reminder_at: string | null; start_time: string | null }[]) {
      // (a) Reminder time arrived — once ever per task.
      if (t.reminder_at && Date.parse(t.reminder_at) <= now && !notified.includes(t.id)) {
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
      // (b) Start time passed and the task is still not done — the
      // "you forgot this task" nudge, once per task per day.
      if (t.start_time && Date.parse(t.start_time) <= now) {
        const key = `${t.id}:${today}`;
        if (!notified.includes(key)) {
          const when = new Date(t.start_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
          try {
            new Notification(`Still pending: ${t.title}`, {
              body: `You were meant to start this at ${when}${t.place ? ` · ${t.place}` : ""} — it is still not done.`,
              tag: `edith-task-pending-${t.id}-${today}`,
            });
          } catch { /* notifications blocked */ }
          notified.push(key);
          changed = true;
        }
      }
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
