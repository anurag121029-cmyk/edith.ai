"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AppShell, Glass, EmptyState } from "@/components/ui";
import { useUser } from "@/lib/useUser";
import {
  RELAXATION_SESSIONS,
  RELAXATION_DISCLAIMER,
  RELAX_CATEGORIES,
  phaseAt,
  progressAt,
  relaxScale,
  sessionTotalSeconds,
  relaxationRecord,
  type SessionDef,
} from "@/lib/relaxation";

/** Speak a phase instruction out loud (browser speech — optional, best effort). */
function speak(text: string) {
  try {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.9;
    window.speechSynthesis.speak(u);
  } catch {
    /* Speech unavailable — the visual guidance still works. */
  }
}

function stopSpeech() {
  try {
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
  } catch {
    /* ignore */
  }
}

function fmt(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export default function Page() {
  const { user, loading, sb } = useUser();
  const [active, setActive] = useState<SessionDef | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [paused, setPaused] = useState(false);
  const [voiceOn, setVoiceOn] = useState(false);
  const [finished, setFinished] = useState(false);
  const [mood, setMood] = useState("");
  const [saved, setSaved] = useState(false);
  const [saveNote, setSaveNote] = useState("");
  const [saveErr, setSaveErr] = useState("");
  const [historyCount, setHistoryCount] = useState<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef(0);
  const spokenStepRef = useRef(-1);

  function clearTimer() {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = null;
  }
  useEffect(() => () => { clearTimer(); stopSpeech(); }, []);

  async function loadHistory() {
    if (!sb || !user) return;
    try {
      const { count, error } = await sb.from("relaxation_sessions").select("id", { count: "exact", head: true });
      if (!error) setHistoryCount(count ?? 0);
      // On error (e.g. the table is not created yet) leave the count
      // unknown — the page still works, it just shows no history.
    } catch {
      /* ignore — history is optional */
    }
  }
  useEffect(() => { loadHistory(); /* eslint-disable-next-line */ }, [user]);

  function runTimer(total: number) {
    clearTimer();
    intervalRef.current = setInterval(() => {
      const e = (Date.now() - startedAtRef.current) / 1000;
      if (e >= total) {
        clearTimer();
        setElapsed(total);
        setFinished(true);
      } else {
        setElapsed(e);
      }
    }, 100);
  }

  function startSession(s: SessionDef) {
    stopSpeech();
    spokenStepRef.current = -1;
    setActive(s);
    setElapsed(0);
    setPaused(false);
    setFinished(false);
    setMood("");
    setSaved(false);
    setSaveNote("");
    setSaveErr("");
    startedAtRef.current = Date.now();
    runTimer(sessionTotalSeconds(s));
  }

  function pause() {
    clearTimer();
    stopSpeech();
    setPaused(true);
  }

  function resume() {
    if (!active) return;
    startedAtRef.current = Date.now() - elapsed * 1000;
    setPaused(false);
    runTimer(sessionTotalSeconds(active));
  }

  function stopSession() {
    clearTimer();
    stopSpeech();
    setActive(null);
    setElapsed(0);
    setPaused(false);
    setFinished(false);
  }

  const phase = active ? phaseAt(active, elapsed) : null;
  const scale = active && phase ? relaxScale(active, phase) : 0.8;
  const progress = active ? progressAt(active, elapsed) : 0;

  // Voice guidance: speak each step's instruction once, when the step changes.
  useEffect(() => {
    if (!voiceOn || paused || finished || !active || !phase) return;
    if (phase.stepIndex !== spokenStepRef.current) {
      spokenStepRef.current = phase.stepIndex;
      speak(phase.instruction);
    }
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [elapsed, voiceOn, paused, finished, active]);

  async function saveFinish() {
    if (!sb || !user || !active) {
      // Not signed in — nothing to record; the session still counts.
      setSaveNote("Session complete — sign in to record your practice.");
      setSaved(true);
      return;
    }
    try {
      const rec = relaxationRecord(active.id, sessionTotalSeconds(active), mood === "" ? null : Number(mood));
      const { error } = await sb.from("relaxation_sessions").insert({ user_id: user.id, ...rec });
      if (error) {
        // A missing table must never break the finish screen.
        setSaveErr("Could not save this session — your practice still counts, it just wasn't recorded.");
      } else {
        setSaveNote("Saved. Your practice is recorded.");
        setSaved(true);
        setHistoryCount((c) => (c === null ? 1 : c + 1));
      }
    } catch {
      setSaveErr("Could not save this session — your practice still counts, it just wasn't recorded.");
    }
  }

  return (
    <AppShell title="Guided relaxation">
      {loading && <p className="muted">Loading…</p>}
      {!loading && !user && (
        <Glass>
          <EmptyState text="Sign in to save your relaxation practice. You can still browse the sessions below." />
          <p><Link className="btn" href="/login">Log in</Link></p>
        </Glass>
      )}

      {!active && (
        <>
          <Glass>
            <p className="muted" style={{ marginTop: 0 }}>
              Short guided sessions to slow down — breathing, body and mind.
              Pick one, press start, and follow the circle and the words.
            </p>
            {historyCount !== null && (
              historyCount > 0
                ? <p><strong>You have completed {historyCount} guided session{historyCount === 1 ? "" : "s"}.</strong></p>
                : <p className="muted">No sessions completed yet — start your first one below.</p>
            )}
            <p className="muted" style={{ fontSize: ".85rem" }}>{RELAXATION_DISCLAIMER}</p>
          </Glass>
          <div style={{ height: 12 }} />
          <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
            {RELAXATION_SESSIONS.map((s) => (
              <Glass key={s.id}>
                <p style={{ margin: "0 0 .3rem" }}>
                  <span style={{ fontSize: ".8rem", fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)" }}>
                    {RELAX_CATEGORIES[s.category]} · {s.minutes} min
                  </span>
                </p>
                <h3 style={{ margin: "0 0 .3rem" }}>{s.title}</h3>
                <p className="muted" style={{ fontSize: ".9rem", margin: "0 0 .8rem" }}>{s.tagline}</p>
                <p><button type="button" className="btn" onClick={() => startSession(s)}>▶ Start</button></p>
              </Glass>
            ))}
          </div>
          <p style={{ marginTop: "1rem" }}>
            <Link className="btn btn-secondary" href="/mood">← Back to mood</Link>
          </p>
        </>
      )}

      {active && phase && !finished && (
        <Glass>
          <div style={{ textAlign: "center", padding: ".5rem 0" }}>
            <h2 style={{ marginTop: 0 }}>{active.title}</h2>
            <div
              aria-label={`Relaxation: ${phase.label}`}
              role="img"
              style={{
                width: 180,
                height: 180,
                margin: "0 auto",
                borderRadius: "50%",
                background: "radial-gradient(circle at 35% 35%, #7c6cf0, #0ea5a4)",
                transform: `scale(${scale})`,
                transition: "transform 0.15s linear",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                fontWeight: 700,
                fontSize: "1.2rem",
                textAlign: "center",
                padding: "1rem",
              }}
            >
              {phase.label}
            </div>
            <p style={{ margin: ".8rem 0 0", fontSize: "1.05rem" }}>{phase.instruction}</p>
            <p className="muted" style={{ fontSize: ".85rem", margin: ".4rem 0 0" }}>
              Step {phase.stepIndex + 1} of {active.steps.length} · {Math.ceil(phase.stepTotal - phase.stepElapsed)}s left in this step
            </p>
            <div aria-hidden="true" style={{ height: 8, borderRadius: 999, background: "rgba(127,127,127,.25)", overflow: "hidden", maxWidth: 320, margin: ".7rem auto 0" }}>
              <div style={{ width: `${Math.round(progress * 100)}%`, height: "100%", background: "#0ea5a4" }} />
            </div>
            <p className="muted" style={{ fontSize: ".85rem", margin: ".3rem 0 0" }}>
              {fmt(phase.totalElapsed)} of {fmt(phase.totalSeconds)}
            </p>
            <label style={{ display: "flex", gap: ".4rem", justifyContent: "center", alignItems: "center", marginTop: ".8rem", fontSize: ".9rem" }}>
              <input
                type="checkbox"
                checked={voiceOn}
                onChange={(e) => {
                  const on = e.target.checked;
                  setVoiceOn(on);
                  if (!on) stopSpeech();
                  else spokenStepRef.current = -1;
                }}
              />
              Voice guidance (reads each step out loud)
            </label>
            <p style={{ display: "flex", gap: ".5rem", justifyContent: "center", marginTop: ".8rem" }}>
              {paused
                ? <button type="button" className="btn" onClick={resume}>▶ Resume</button>
                : <button type="button" className="btn btn-secondary" onClick={pause}>⏸ Pause</button>}
              <button type="button" className="btn btn-secondary" onClick={stopSession}>■ Stop</button>
            </p>
            <p className="muted" style={{ fontSize: ".85rem" }}>{RELAXATION_DISCLAIMER}</p>
          </div>
        </Glass>
      )}

      {active && finished && (
        <Glass>
          <div style={{ textAlign: "center", padding: ".5rem 0" }}>
            <h2 style={{ marginTop: 0 }}>Done — {active.title} complete.</h2>
            <p className="muted">You finished {fmt(sessionTotalSeconds(active))} of guided relaxation. Nice work.</p>
            {historyCount !== null && historyCount > 0 && (
              <p>That makes <strong>{historyCount}</strong> guided session{historyCount === 1 ? "" : "s"} completed.</p>
            )}
            {!saved ? (
              <>
                <p><strong>How do you feel now?</strong></p>
                <label htmlFor="rm">Mood after (optional)</label>
                <select id="rm" className="input" value={mood} onChange={(e) => setMood(e.target.value)} style={{ maxWidth: 220, margin: "0 auto" }}>
                  <option value="">No mood attached</option>
                  {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}/10</option>)}
                </select>
                <p style={{ display: "flex", gap: ".5rem", justifyContent: "center", marginTop: ".8rem" }}>
                  <button type="button" className="btn" onClick={saveFinish}>Save this session</button>
                  <button type="button" className="btn btn-secondary" onClick={stopSession}>Skip saving</button>
                </p>
                {saveErr && <p className="error" role="alert">{saveErr}</p>}
              </>
            ) : (
              <>
                <p><strong>{saveNote}</strong> <Link href="/mood">Log how you feel →</Link></p>
                <p><button type="button" className="btn" onClick={stopSession}>Back to sessions</button></p>
              </>
            )}
            <p className="muted" style={{ fontSize: ".85rem" }}>{RELAXATION_DISCLAIMER}</p>
          </div>
        </Glass>
      )}
    </AppShell>
  );
}
