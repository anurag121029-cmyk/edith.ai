/**
 * Guided relaxation sessions — a library with a real player, not just a timer.
 *
 * A session is a fixed list of timed steps (label + instruction each).
 * The player walks the steps in order; `phaseAt` is the only clock the
 * UI needs, so the timing is pure and testable. Session definitions are
 * validated by `validateSessions` (unique ids, every step > 0 seconds,
 * steps summing to exactly minutes × 60).
 *
 * Box breathing here uses the SAME 4-4-4-4 timing as the existing
 * exercise in lib/breathing.ts (16-second cycles, 2-minute session) —
 * the library reuses the pattern, it does not redefine it.
 *
 * These are general, non-clinical calming exercises — wellness support,
 * not medical treatment or a diagnosis.
 */

export const RELAXATION_DISCLAIMER =
  "Guided relaxation sessions are general wellness support — not medical treatment, therapy or a diagnosis. If you feel unwell, or stress keeps feeling high, talk to a clinician or someone you trust.";

export interface RelaxStep {
  label: string;
  /** Seconds this step lasts. */
  seconds: number;
  instruction: string;
}

export type RelaxCategory = "breathing" | "body" | "mind";

export interface SessionDef {
  id: string;
  title: string;
  tagline: string;
  category: RelaxCategory;
  /** Whole minutes; steps must sum to exactly minutes × 60. */
  minutes: number;
  steps: RelaxStep[];
}

export interface RelaxPhase {
  stepIndex: number;
  label: string;
  instruction: string;
  /** Seconds into the current step. */
  stepElapsed: number;
  /** Total seconds of the current step. */
  stepTotal: number;
  /** Total seconds into the session (clamped to the session length). */
  totalElapsed: number;
  totalSeconds: number;
  done: boolean;
}

export const RELAX_CATEGORIES: Record<RelaxCategory, string> = {
  breathing: "Breathing",
  body: "Body",
  mind: "Mind",
};

/** Total length of a session in seconds. */
export function sessionTotalSeconds(session: SessionDef): number {
  return session.steps.reduce((s, st) => s + st.seconds, 0);
}

/** Which step the user is in at a given number of seconds into the session. */
export function phaseAt(session: SessionDef, elapsedSeconds: number): RelaxPhase {
  const total = sessionTotalSeconds(session);
  const elapsed = Math.max(0, Math.min(elapsedSeconds, total));
  const done = elapsedSeconds >= total;
  let acc = 0;
  let idx = session.steps.length - 1;
  for (let i = 0; i < session.steps.length; i++) {
    if (elapsed < acc + session.steps[i].seconds) {
      idx = i;
      break;
    }
    acc += session.steps[i].seconds;
  }
  const step = session.steps[idx];
  return {
    stepIndex: idx,
    label: step.label,
    instruction: step.instruction,
    // At the exact end the last step is fully complete, not 0s in.
    stepElapsed: done ? step.seconds : elapsed - acc,
    stepTotal: step.seconds,
    totalElapsed: elapsed,
    totalSeconds: total,
    done,
  };
}

/** Session progress as a fraction 0–1. */
export function progressAt(session: SessionDef, elapsedSeconds: number): number {
  const total = sessionTotalSeconds(session);
  if (total <= 0) return 0;
  return Math.min(1, Math.max(0, elapsedSeconds / total));
}

/** True once the session has run its full length. */
export function sessionDone(session: SessionDef, elapsedSeconds: number): boolean {
  return elapsedSeconds >= sessionTotalSeconds(session);
}

type StepKind = "in" | "out" | "hold" | "rest";

/** Classify a step from its label, for the animated circle. */
function stepKind(label: string): StepKind {
  const l = label.toLowerCase();
  if (l.includes("inhale") || l.includes("breathe in")) return "in";
  if (l.includes("exhale") || l.includes("breathe out") || l.includes("release")) return "out";
  if (l.includes("hold")) return "hold";
  return "rest";
}

/**
 * Circle scale for the player animation: grows while breathing in
 * (0.6 → 1), shrinks while breathing out (1 → 0.6), stays full while
 * holding after an inhale and small while holding after an exhale,
 * and rests at 0.8 for body/mind steps.
 */
export function relaxScale(session: SessionDef, phase: RelaxPhase): number {
  const step = session.steps[phase.stepIndex];
  const kind = stepKind(step.label);
  const f = Math.min(1, Math.max(0, phase.stepElapsed / phase.stepTotal));
  if (kind === "in") return 0.6 + 0.4 * f;
  if (kind === "out") return 1 - 0.4 * f;
  if (kind === "hold") {
    const prev = phase.stepIndex > 0 ? stepKind(session.steps[phase.stepIndex - 1].label) : "rest";
    if (prev === "in") return 1;
    if (prev === "out") return 0.6;
    return 0.8;
  }
  return 0.8;
}

/** Look a session up by id, or null. */
export function getSession(id: string): SessionDef | null {
  return RELAXATION_SESSIONS.find((s) => s.id === id) || null;
}

/**
 * Validate session definitions. Returns a list of problems (empty when
 * valid): unique ids, every step > 0 seconds, steps summing to exactly
 * minutes × 60, every step with a label and instruction.
 */
export function validateSessions(sessions: SessionDef[] = RELAXATION_SESSIONS): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const s of sessions) {
    if (!s.id) errors.push("Session is missing an id.");
    else if (seen.has(s.id)) errors.push(`Duplicate session id: ${s.id}.`);
    else seen.add(s.id);
    if (!s.title) errors.push(`Session ${s.id || "?"} is missing a title.`);
    if (!s.tagline) errors.push(`Session ${s.id || "?"} is missing a tagline.`);
    if (s.category !== "breathing" && s.category !== "body" && s.category !== "mind") {
      errors.push(`Session ${s.id} has an invalid category: ${String(s.category)}.`);
    }
    if (!Number.isFinite(s.minutes) || s.minutes <= 0) {
      errors.push(`Session ${s.id} has an invalid length in minutes: ${String(s.minutes)}.`);
    }
    if (!s.steps.length) {
      errors.push(`Session ${s.id} has no steps.`);
      continue;
    }
    for (let i = 0; i < s.steps.length; i++) {
      const st = s.steps[i];
      if (!st.label) errors.push(`Session ${s.id} step ${i} is missing a label.`);
      if (!st.instruction) errors.push(`Session ${s.id} step ${i} is missing an instruction.`);
      if (!Number.isFinite(st.seconds) || st.seconds <= 0) {
        errors.push(`Session ${s.id} step ${i} (${st.label || "?"}) has invalid seconds: ${String(st.seconds)}.`);
      }
    }
    const total = sessionTotalSeconds(s);
    if (total !== s.minutes * 60) {
      errors.push(`Session ${s.id} steps sum to ${total}s but minutes say ${s.minutes} (${s.minutes * 60}s).`);
    }
  }
  return errors;
}

/** Insert payload for a finished session (see migration 0007). */
export function relaxationRecord(
  sessionId: string,
  durationSeconds: number,
  moodAfter: number | null,
): { session_id: string; duration_seconds: number; completed: boolean; mood_after: number | null } {
  return {
    session_id: sessionId,
    duration_seconds: Math.max(0, Math.round(durationSeconds)),
    completed: true,
    mood_after: moodAfter === null || moodAfter === undefined ? null : Math.min(10, Math.max(1, Math.round(moodAfter))),
  };
}

/* ------------------------------------------------------------------ */
/* Session definitions                                                 */
/* ------------------------------------------------------------------ */

/** Repeat a breathing pattern to fill exactly totalSeconds, truncating the final step if needed. */
function repeatPattern(
  totalSeconds: number,
  pattern: { label: string; seconds: number; instruction: string }[],
): RelaxStep[] {
  const steps: RelaxStep[] = [];
  let remaining = totalSeconds;
  while (remaining > 0) {
    for (const p of pattern) {
      if (remaining <= 0) break;
      const seconds = Math.min(p.seconds, remaining);
      steps.push({ label: p.label, seconds, instruction: p.instruction });
      remaining -= seconds;
    }
  }
  return steps;
}

function cycleSteps(
  cycles: number,
  pattern: { label: string; seconds: number; instruction: string }[],
): RelaxStep[] {
  const steps: RelaxStep[] = [];
  for (let c = 0; c < cycles; c++) steps.push(...pattern.map((p) => ({ ...p })));
  return steps;
}

const BOX_PATTERN = [
  { label: "Inhale", seconds: 4, instruction: "Breathe in slowly through your nose, filling your belly." },
  { label: "Hold", seconds: 4, instruction: "Hold the breath. Shoulders down, jaw loose." },
  { label: "Exhale", seconds: 4, instruction: "Breathe out slowly through your mouth, letting everything soften." },
  { label: "Hold", seconds: 4, instruction: "Rest at the bottom of the breath. Nothing to do for a moment." },
];

const RESET_PATTERN = [
  { label: "Breathe in", seconds: 4, instruction: "Breathe in gently for four — slow and easy." },
  { label: "Breathe out", seconds: 6, instruction: "Breathe out for six, longer than the in-breath. Let your shoulders drop." },
];

const FOUR_SEVEN_EIGHT = [
  { label: "Inhale", seconds: 4, instruction: "Breathe in quietly through your nose for four." },
  { label: "Hold", seconds: 7, instruction: "Hold for seven. Keep your shoulders relaxed." },
  { label: "Exhale", seconds: 8, instruction: "Breathe out slowly through your mouth for eight, like blowing through a straw." },
];

const BODY_PARTS: { part: string; instruction: string }[] = [
  { part: "Feet", instruction: "Bring your attention to your feet. Notice the weight of them, the contact with the floor. No need to change anything — just notice." },
  { part: "Legs", instruction: "Move your attention up to your legs. Notice any heaviness or tingling. Let them be exactly as they are." },
  { part: "Stomach", instruction: "Notice your stomach. Feel it rise and fall with your breath. If it is tight, let it soften a little on the next out-breath." },
  { part: "Chest", instruction: "Bring your attention to your chest. Feel your heartbeat and your breath moving here. Nothing to fix — just notice." },
  { part: "Hands", instruction: "Notice your hands. Are they clenched or open? Let your fingers uncurl and rest." },
  { part: "Arms", instruction: "Feel your arms from shoulders to fingertips. Let any tension drain out through your hands." },
  { part: "Shoulders", instruction: "Notice your shoulders. They often carry the day's tension. Drop them down and back, away from your ears." },
  { part: "Neck", instruction: "Bring your attention to your neck and throat. Gently roll your head if it helps, then let it rest." },
  { part: "Face", instruction: "Soften your face — forehead, eyes, jaw. Unclench your teeth and let your tongue rest." },
  { part: "Whole body", instruction: "Now notice your whole body at once, breathing calmly. You are here, and for this moment, there is nothing else to do." },
];

const MUSCLE_GROUPS: { group: string; tense: string; release: string }[] = [
  { group: "Hands", tense: "Make tight fists with both hands. Squeeze hard.", release: "Let go all at once. Feel the warmth and tingling as your hands open." },
  { group: "Arms", tense: "Bend your arms and tense your biceps, like showing your muscles.", release: "Drop your arms and let them hang loose. Notice the difference." },
  { group: "Shoulders", tense: "Shrug your shoulders up towards your ears and hold them tight.", release: "Drop your shoulders down. Feel the tension melt away." },
  { group: "Face", tense: "Scrunch up your whole face — squeeze your eyes shut, clench your jaw.", release: "Let your face go smooth. Forehead wide, jaw loose, eyes soft." },
  { group: "Stomach", tense: "Tighten your stomach muscles, as if bracing for a gentle poke.", release: "Let your stomach soften. Breathe into it and let it rise and fall." },
  { group: "Legs", tense: "Press your legs together and tighten your thighs.", release: "Let your legs go heavy and still. Feel them sink into the chair or floor." },
  { group: "Feet", tense: "Curl your toes hard and press your feet into the floor.", release: "Uncurl your toes and let your feet rest flat. Notice how light they feel now." },
];

const CALM_PLACE_STEPS: RelaxStep[] = [
  { label: "Arrive", seconds: 50, instruction: "Settle in and close your eyes if you like. Take three slow breaths, and let the noise of the day fade a little." },
  { label: "See your place", seconds: 50, instruction: "Picture a place where you feel completely calm — a beach, a forest, a quiet room. See the colours and the light there." },
  { label: "Hear it", seconds: 50, instruction: "Listen to the sounds of your calm place — waves, leaves, birdsong, or just quiet. Let them fill the space." },
  { label: "Feel it", seconds: 50, instruction: "Feel the air on your skin, the ground under you. Notice the temperature and the texture of this place." },
  { label: "Breathe it in", seconds: 50, instruction: "Breathe in the calm of this place. With each breath, let it spread through your body." },
  { label: "Return slowly", seconds: 50, instruction: "When you are ready, slowly bring your attention back to the room. Wiggle your fingers, open your eyes, and carry a little of that calm with you." },
];

export const RELAXATION_SESSIONS: SessionDef[] = [
  {
    id: "box-breathing",
    title: "Box breathing",
    tagline: "The classic 4-4-4-4 calm-down — in, hold, out, hold.",
    category: "breathing",
    minutes: 2,
    steps: repeatPattern(120, BOX_PATTERN),
  },
  {
    id: "breathing-478",
    title: "4-7-8 breathing",
    tagline: "A slow, sleepy rhythm — in for 4, hold for 7, out for 8.",
    category: "breathing",
    minutes: 2,
    steps: [
      ...cycleSteps(6, FOUR_SEVEN_EIGHT),
      { label: "Rest", seconds: 6, instruction: "Breathe normally for a moment. Notice how much slower everything feels." },
    ],
  },
  {
    id: "quick-reset",
    title: "Quick reset",
    tagline: "Two minutes of slow breathing when you need to reset fast.",
    category: "breathing",
    minutes: 2,
    steps: repeatPattern(120, RESET_PATTERN),
  },
  {
    id: "body-scan",
    title: "Body scan",
    tagline: "Five minutes of gentle attention, from your feet to your head.",
    category: "body",
    minutes: 5,
    steps: BODY_PARTS.map((b) => ({ label: b.part, seconds: 30, instruction: b.instruction })),
  },
  {
    id: "muscle-relaxation",
    title: "Progressive muscle relaxation",
    tagline: "Tense, then release — seven muscle groups, one by one.",
    category: "body",
    minutes: 7,
    steps: MUSCLE_GROUPS.flatMap((g) => [
      { label: `Tense — ${g.group}`, seconds: 10, instruction: g.tense },
      { label: `Release — ${g.group}`, seconds: 20, instruction: g.release },
      { label: `Rest — ${g.group}`, seconds: 30, instruction: `Rest and notice how your ${g.group.toLowerCase()} feel now — warmer, heavier, looser than before.` },
    ]),
  },
  {
    id: "calm-place",
    title: "Calm place visualisation",
    tagline: "Picture a place where you feel safe and calm, and stay there a while.",
    category: "mind",
    minutes: 5,
    steps: CALM_PLACE_STEPS,
  },
];
