"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Glass } from "@/components/ui";
import { useUser } from "@/lib/useUser";
import {
  SLEEP_CHIPS,
  sleepHoursForChip,
  morningCheckinRecord,
  todaysCheckin,
  type CheckinLike,
} from "@/lib/morningCheckin";

/**
 * Morning check-in — two taps, about ten seconds.
 * Tap 1: mood 1–10. Tap 2: sleep last night (a range chip). The second
 * tap saves automatically to mood_checkins. If a check-in already exists
 * for today it shows the done state instead.
 *
 * Stress is estimated from mood here (11 − mood) — see
 * lib/morningCheckin.ts — and the UI says so. If the sleep column does
 * not exist yet in the live database (migration 0008 not applied), the
 * mood is still saved and the sleep is reported as not recorded, rather
 * than failing the whole check-in.
 */
export default function MorningCheckin() {
  const { user, sb, loading } = useUser();
  const [today, setToday] = useState<CheckinLike | null>(null);
  const [todayLoaded, setTodayLoaded] = useState(false);
  const [mood, setMood] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [sleepNote, setSleepNote] = useState("");
  const [again, setAgain] = useState(false);

  async function loadToday() {
    if (!sb || !user) return;
    try {
      const { data, error } = await sb
        .from("mood_checkins")
        .select("mood_score,stress_score,sleep_hours,created_at")
        .order("created_at", { ascending: false })
        .limit(10);
      if (!error) setToday(todaysCheckin((data || []) as CheckinLike[]));
      // On error (e.g. table unreachable) the form still shows — the
      // save will surface the problem if it is real.
    } catch {
      /* ignore — the form still works */
    } finally {
      setTodayLoaded(true);
    }
  }
  useEffect(() => { loadToday(); /* eslint-disable-next-line */ }, [user]);

  async function save(chipId: string) {
    if (!sb || !user || mood === null || saving) return;
    const hours = sleepHoursForChip(chipId);
    if (hours === null) return;
    setSaving(true);
    setErr("");
    setSleepNote("");
    try {
      const rec = morningCheckinRecord(mood, hours);
      const { error } = await sb.from("mood_checkins").insert({ user_id: user.id, ...rec });
      if (error) {
        if (error.message.includes("sleep_hours")) {
          // Migration 0008 not applied yet — save the mood without sleep.
          const { error: retryErr } = await sb.from("mood_checkins").insert({
            user_id: user.id,
            mood_score: rec.mood_score,
            stress_score: rec.stress_score,
            note: null,
          });
          if (retryErr) throw new Error(retryErr.message);
          setSleepNote("Your mood was saved, but last night's sleep wasn't recorded yet — the sleep update is still rolling out. It will work once it is applied.");
          setToday({ mood_score: rec.mood_score, stress_score: rec.stress_score, sleep_hours: null, created_at: new Date().toISOString() });
        } else {
          throw new Error(error.message);
        }
      } else {
        setToday({ mood_score: rec.mood_score, stress_score: rec.stress_score, sleep_hours: rec.sleep_hours, created_at: new Date().toISOString() });
      }
      setAgain(false);
    } catch (e) {
      setErr((e as Error).message || "Could not save your check-in.");
    } finally {
      setSaving(false);
    }
  }

  const done = todayLoaded && today !== null && !again;

  return (
    <Glass>
      <h2 style={{ marginTop: 0 }}>Good morning — two taps, ten seconds</h2>
      {loading && <p className="muted">Loading…</p>}
      {!loading && !user && (
        <p className="muted">Sign in to check in each morning — your mood and sleep build the patterns EDITH learns from. <Link href="/login">Log in →</Link></p>
      )}
      {user && done && today && (
        <>
          <p>
            <strong>✓ Checked in today.</strong> Mood {today.mood_score}/10
            {today.sleep_hours !== null && today.sleep_hours !== undefined ? ` · slept about ${today.sleep_hours}h last night` : " · sleep not recorded"}.
          </p>
          {sleepNote && <p className="muted" style={{ fontSize: ".85rem" }}>{sleepNote}</p>}
          <p style={{ display: "flex", gap: ".5rem", flexWrap: "wrap" }}>
            <button type="button" className="btn btn-secondary" onClick={() => { setAgain(true); setMood(null); setErr(""); setSleepNote(""); }}>Check in again</button>
            <Link className="btn btn-secondary" href="/mood">See your mood →</Link>
          </p>
        </>
      )}
      {user && !done && (
        <>
          {mood === null ? (
            <>
              <p style={{ margin: ".2rem 0 .6rem" }}><strong>Tap 1 — how is your mood right now?</strong></p>
              <div style={{ display: "flex", gap: ".4rem", flexWrap: "wrap" }} role="group" aria-label="Mood from 1 to 10">
                {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                  <button
                    key={n}
                    type="button"
                    className="btn btn-secondary"
                    aria-label={`Mood ${n} out of 10`}
                    onClick={() => { setMood(n); setErr(""); }}
                    style={{ minWidth: 44, minHeight: 44, padding: ".4rem .6rem" }}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <p className="muted" style={{ fontSize: ".85rem", margin: ".5rem 0 0" }}>1 = a rough day · 10 = a great day</p>
            </>
          ) : (
            <>
              <p style={{ margin: ".2rem 0 .6rem" }}>
                <strong>Tap 2 — how long did you sleep last night?</strong>{" "}
                <span className="muted">(mood {mood}/10 — <button type="button" className="btn btn-secondary" style={{ padding: ".1rem .5rem", minHeight: 0 }} onClick={() => setMood(null)}>change</button>)</span>
              </p>
              <div style={{ display: "flex", gap: ".4rem", flexWrap: "wrap" }} role="group" aria-label="Sleep last night in hours">
                {SLEEP_CHIPS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="btn"
                    disabled={saving}
                    onClick={() => save(c.id)}
                    style={{ minHeight: 44, padding: ".5rem .9rem" }}
                  >
                    {c.label}h
                  </button>
                ))}
              </div>
              <p className="muted" style={{ fontSize: ".85rem", margin: ".5rem 0 0" }}>
                {saving ? "Saving…" : "Tapping one saves your check-in automatically."}
              </p>
            </>
          )}
          {err && <p className="error" role="alert">{err}</p>}
        </>
      )}
      <p className="muted" style={{ fontSize: ".85rem", marginBottom: 0 }}>
        Self-reported estimates, not a diagnosis. Stress here is estimated from your mood (11 − mood) — set it yourself in the full check-in on the <Link href="/mood">Mood page</Link>. Nothing here is sent to the AI.
      </p>
    </Glass>
  );
}
