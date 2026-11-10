"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BREATH_SESSION_SECONDS, phaseAt, breathScale } from "@/lib/breathing";

/**
 * Box breathing — 4s inhale → 4s hold → 4s exhale → 4s hold, for
 * 2 minutes. The circle grows and shrinks with the phase, the phase
 * name and cycle count are shown, and the session ends with a short
 * "how do you feel?" note. A general, non-clinical calming exercise —
 * not a medical treatment.
 */
export default function BreathingExercise() {
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [finished, setFinished] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function stop() {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = null;
    setRunning(false);
  }
  useEffect(() => () => { if (intervalRef.current) clearInterval(intervalRef.current); }, []);

  function start() {
    setElapsed(0);
    setFinished(false);
    setRunning(true);
    const startedAt = Date.now();
    intervalRef.current = setInterval(() => {
      const e = (Date.now() - startedAt) / 1000;
      setElapsed(e);
      if (e >= BREATH_SESSION_SECONDS) {
        stop();
        setFinished(true);
      }
    }, 100);
  }

  const state = phaseAt(elapsed);
  const scale = breathScale(state);
  const progress = Math.min(100, (elapsed / BREATH_SESSION_SECONDS) * 100);

  return (
    <div style={{ textAlign: "center", padding: ".5rem 0" }}>
      <div
        aria-label={running ? `Breathing: ${state.phase}, cycle ${state.cycle}` : "Breathing exercise"}
        role="img"
        style={{
          width: 160,
          height: 160,
          margin: "0 auto",
          borderRadius: "50%",
          background: "radial-gradient(circle at 35% 35%, #7c6cf0, #0ea5a4)",
          transform: `scale(${running ? scale : 0.6})`,
          transition: "transform 0.15s linear",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#fff",
          fontWeight: 700,
        }}
      >
        {running ? state.phase : "Breathe"}
      </div>
      {running && (
        <>
          <p style={{ margin: ".7rem 0 0" }}>
            <strong>{state.phase}</strong> — {Math.ceil(state.phaseRemaining)}s left in this step · Cycle {state.cycle}
          </p>
          <div aria-hidden="true" style={{ height: 8, borderRadius: 999, background: "rgba(127,127,127,.25)", overflow: "hidden", maxWidth: 320, margin: ".5rem auto 0" }}>
            <div style={{ width: `${progress}%`, height: "100%", background: "#0ea5a4" }} />
          </div>
          <p className="muted" style={{ fontSize: ".85rem", margin: ".3rem 0 0" }}>
            {Math.floor(elapsed)}s of {BREATH_SESSION_SECONDS}s — 4s in, 4s hold, 4s out, 4s hold.
          </p>
        </>
      )}
      {finished && (
        <p style={{ marginTop: ".7rem" }}>
          <strong>Done — 2 minutes of box breathing.</strong> How do you feel now?
          A little calmer is a win. <Link href="/mood">Log how you feel →</Link>
        </p>
      )}
      <p style={{ display: "flex", gap: ".5rem", justifyContent: "center", marginTop: ".7rem" }}>
        {running
          ? <button type="button" className="btn btn-secondary" onClick={() => { stop(); setElapsed(0); }}>■ Stop</button>
          : <button type="button" className="btn" onClick={start}>{finished ? "Breathe again" : "▶ Start 2-minute breathing"}</button>}
      </p>
      <p className="muted" style={{ fontSize: ".85rem" }}>A short calming exercise, not medical advice. If stress keeps feeling high, talk to someone you trust or a professional.</p>
    </div>
  );
}
