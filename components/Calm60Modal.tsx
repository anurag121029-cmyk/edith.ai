"use client";
import { useEffect, useRef, useState } from "react";
import {
  getSession,
  phaseAt,
  progressAt,
  relaxScale,
  sessionTotalSeconds,
  relaxationRecord,
  RELAXATION_DISCLAIMER,
} from "@/lib/relaxation";
import { useUser } from "@/lib/useUser";

/**
 * "Calm in 60 seconds" — a modal player for the quick-calm-60 session.
 *
 * It reuses the same engine as the /relax page (phaseAt / progressAt /
 * relaxScale over the session definition in lib/relaxation.ts) and the
 * same timer shape — a 100ms interval against a Date.now() start, so
 * pausing and resuming keep honest time. Six rounds of 4s inhale /
 * 6s exhale, exactly 60 seconds.
 *
 * On finish it offers an optional mood 1–10 and saves the session
 * best-effort to relaxation_sessions, exactly like the /relax page:
 * a missing table must never break the finish screen.
 */
function fmt(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export default function Calm60Modal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, sb } = useUser();
  const session = getSession("quick-calm-60");
  const [elapsed, setElapsed] = useState(0);
  const [paused, setPaused] = useState(false);
  const [finished, setFinished] = useState(false);
  const [mood, setMood] = useState("");
  const [saved, setSaved] = useState(false);
  const [saveNote, setSaveNote] = useState("");
  const [saveErr, setSaveErr] = useState("");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef(0);

  function clearTimer() {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = null;
  }

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

  // (Re)start the 60 seconds every time the modal opens.
  useEffect(() => {
    if (!open || !session) return;
    setElapsed(0);
    setPaused(false);
    setFinished(false);
    setMood("");
    setSaved(false);
    setSaveNote("");
    setSaveErr("");
    startedAtRef.current = Date.now();
    runTimer(sessionTotalSeconds(session));
    return () => clearTimer();
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [open ]);

  function pause() {
    clearTimer();
    setPaused(true);
  }

  function resume() {
    if (!session) return;
    startedAtRef.current = Date.now() - elapsed * 1000;
    setPaused(false);
    runTimer(sessionTotalSeconds(session));
  }

  function close() {
    clearTimer();
    onClose();
  }

  async function saveFinish() {
    if (!session) return;
    if (!sb || !user) {
      setSaveNote("Session complete — sign in to record your practice.");
      setSaved(true);
      return;
    }
    try {
      const rec = relaxationRecord(session.id, sessionTotalSeconds(session), mood === "" ? null : Number(mood));
      const { error } = await sb.from("relaxation_sessions").insert({ user_id: user.id, ...rec });
      if (error) {
        // A missing table must never break the finish screen.
        setSaveErr("Could not save this session — your practice still counts, it just wasn't recorded.");
      } else {
        setSaveNote("Saved. Your practice is recorded.");
        setSaved(true);
      }
    } catch {
      setSaveErr("Could not save this session — your practice still counts, it just wasn't recorded.");
    }
  }

  if (!open || !session) return null;
  const phase = phaseAt(session, elapsed);
  const scale = relaxScale(session, phase);
  const progress = progressAt(session, elapsed);
  const total = sessionTotalSeconds(session);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Calm in 60 seconds"
      onClick={close}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        background: "rgba(0,0,0,.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--glass-bg, #1a1a2e)",
          border: "1px solid var(--glass-border, rgba(255,255,255,.15))",
          borderRadius: 16,
          padding: "1.5rem",
          maxWidth: 420,
          width: "100%",
          textAlign: "center",
          boxShadow: "0 20px 60px rgba(0,0,0,.5)",
        }}
      >
        {!finished ? (
          <>
            <h2 style={{ marginTop: 0 }}>Calm in 60 seconds</h2>
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
              Round {Math.floor(phase.stepIndex / 2) + 1} of 6 · {Math.ceil(phase.stepTotal - phase.stepElapsed)}s left in this breath
            </p>
            <div aria-hidden="true" style={{ height: 8, borderRadius: 999, background: "rgba(127,127,127,.25)", overflow: "hidden", maxWidth: 320, margin: ".7rem auto 0" }}>
              <div style={{ width: `${Math.round(progress * 100)}%`, height: "100%", background: "#0ea5a4" }} />
            </div>
            <p className="muted" style={{ fontSize: "1.1rem", fontWeight: 700, margin: ".5rem 0 0" }}>
              {fmt(total - phase.totalElapsed)} left
            </p>
            <p style={{ display: "flex", gap: ".5rem", justifyContent: "center", marginTop: ".8rem" }}>
              {paused
                ? <button type="button" className="btn" onClick={resume}>▶ Resume</button>
                : <button type="button" className="btn btn-secondary" onClick={pause}>⏸ Pause</button>}
              <button type="button" className="btn btn-secondary" onClick={close}>■ Stop</button>
            </p>
          </>
        ) : (
          <>
            <h2 style={{ marginTop: 0 }}>Done — 60 seconds of calm.</h2>
            <p className="muted">You finished six slow breaths. Nice work.</p>
            {!saved ? (
              <>
                <p><strong>How do you feel now?</strong></p>
                <label htmlFor="calm60-mood">Mood after (optional)</label>
                <select id="calm60-mood" className="input" value={mood} onChange={(e) => setMood(e.target.value)} style={{ maxWidth: 220, margin: "0 auto" }}>
                  <option value="">No mood attached</option>
                  {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}/10</option>)}
                </select>
                <p style={{ display: "flex", gap: ".5rem", justifyContent: "center", marginTop: ".8rem", flexWrap: "wrap" }}>
                  <button type="button" className="btn" onClick={saveFinish}>Save this session</button>
                  <button type="button" className="btn btn-secondary" onClick={close}>Skip saving</button>
                </p>
                {saveErr && <p className="error" role="alert">{saveErr}</p>}
              </>
            ) : (
              <>
                <p><strong>{saveNote}</strong></p>
                <p><button type="button" className="btn" onClick={close}>Back to dashboard</button></p>
              </>
            )}
          </>
        )}
        <p className="muted" style={{ fontSize: ".85rem", marginBottom: 0 }}>{RELAXATION_DISCLAIMER}</p>
      </div>
    </div>
  );
}
