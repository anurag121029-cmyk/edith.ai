/**
 * Box breathing — the stress-management exercise.
 *
 * One cycle is 16 seconds: 4s inhale → 4s hold → 4s exhale → 4s hold.
 * A session is 2 minutes (120 seconds, 7.5 cycles). Pure timing math so
 * the UI can animate from it; the component owns the clock.
 *
 * This is a general, non-clinical calming exercise — not a medical
 * treatment or diagnosis.
 */

export const BREATH_PHASE_SECONDS = 4;
export const BREATH_CYCLE_SECONDS = 16;
export const BREATH_SESSION_SECONDS = 120;

export const BREATH_PHASES = ["Inhale", "Hold", "Exhale", "Hold"] as const;
export type BreathPhase = (typeof BREATH_PHASES)[number];

export interface BreathState {
  /** 1-based cycle number. */
  cycle: number;
  phaseIndex: number;
  phase: BreathPhase;
  /** Seconds into the current phase (0–4). */
  phaseElapsed: number;
  /** Seconds left in the current phase. */
  phaseRemaining: number;
  /** Total seconds into the session. */
  elapsed: number;
  /** True once the 2-minute session is complete. */
  done: boolean;
}

/** Breathing state at a given number of seconds into the session. */
export function phaseAt(elapsedSeconds: number): BreathState {
  const elapsed = Math.max(0, elapsedSeconds);
  const cycle = Math.floor(elapsed / BREATH_CYCLE_SECONDS) + 1;
  const within = elapsed % BREATH_CYCLE_SECONDS;
  const phaseIndex = Math.min(3, Math.floor(within / BREATH_PHASE_SECONDS));
  const phaseElapsed = within - phaseIndex * BREATH_PHASE_SECONDS;
  return {
    cycle,
    phaseIndex,
    phase: BREATH_PHASES[phaseIndex],
    phaseElapsed,
    phaseRemaining: BREATH_PHASE_SECONDS - phaseElapsed,
    elapsed,
    done: elapsed >= BREATH_SESSION_SECONDS,
  };
}

/**
 * Circle scale for the animation: grows while inhaling (0.6 → 1),
 * stays full while holding after the inhale, shrinks while exhaling
 * (1 → 0.6), stays small while holding after the exhale.
 */
export function breathScale(state: BreathState): number {
  const f = Math.min(1, Math.max(0, state.phaseElapsed / BREATH_PHASE_SECONDS));
  if (state.phaseIndex === 0) return 0.6 + 0.4 * f;
  if (state.phaseIndex === 1) return 1;
  if (state.phaseIndex === 2) return 1 - 0.4 * f;
  return 0.6;
}

/** True once the 2-minute session is complete. */
export function sessionDone(elapsedSeconds: number): boolean {
  return elapsedSeconds >= BREATH_SESSION_SECONDS;
}
