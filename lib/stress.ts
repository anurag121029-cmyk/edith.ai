/**
 * Stress calculator — the main goal of EDITH.
 *
 * A transparent, deterministic stress estimate (0–100, higher = more
 * stressed) computed ONLY from the signed-in user's own recent data:
 * self-reported mood check-ins, logged workload, open/overdue tasks,
 * study sessions, and the wording of their recent chat messages.
 *
 * Formula (weights sum to 100; missing factors are excluded and the
 * remaining weights are renormalised, so a score is never built from
 * invented data):
 *
 *   factor                     weight   value (0–100)
 *   -------------------------  ------   --------------------------------
 *   self-reported stress       30       avg stress_score (1–10) × 10
 *   workload                   25       0.6 × avg intensity × 10
 *                                       + 0.4 × min(total hours, 60)/60 × 100
 *   task pressure              20       min(100, overdue×20 + due-soon
 *                                       high-priority×10 + open×2)
 *   study load                 10       min(100, study minutes / 2520 × 100)
 *                                       (2520 min = 42 h/week cap)
 *   chat mood (keywords)       15       50 + 10 × (stress words − calm words),
 *                                       clamped 0–100; 50 when chats exist
 *                                       but contain no signal words
 *
 * Window: the last 7 days (mood/workload/study/chat), tasks are the
 * currently open ones. Level bands: 0–29 Low, 30–49 Moderate, 50–69
 * High, 70–100 Very high.
 *
 * This is an ESTIMATE from self-reported data. It is explicitly NOT a
 * medical diagnosis or clinical assessment — the score, the API route
 * and every UI surface that shows it must say so.
 */
export const STRESS_DISCLAIMER =
  "Estimate from your own self-reported data — not a medical diagnosis or clinical assessment.";

export const STRESS_WORDS = [
  "stressed", "stress", "overwhelmed", "overwhelm", "anxious", "anxiety",
  "worried", "worry", "panic", "exhausted", "exhaustion", "tired",
  "burnout", "burned out", "burnt out", "can't cope", "cannot cope",
  "too much", "deadline", "pressure", "frustrated", "frustration",
  "sleepless", "can't sleep", "insomnia", "dread", "helpless", "stuck",
  "crying", "angry", "irritated", "headache", "tense",
];
export const CALM_WORDS = [
  "calm", "relaxed", "peaceful", "rested", "good", "great", "fine",
  "better", "relieved", "relief", "happy", "content", "balanced",
  "in control", "manageable", "energised", "energized", "motivated",
  "proud", "confident", "sleep well", "slept well",
];

export interface StressFactor {
  key: string;
  label: string;
  weight: number;
  /** 0–100, or null when the input was missing. */
  value: number | null;
  /** value × weight (0 when missing). */
  contribution: number;
  detail: string;
  missing: boolean;
}

export interface StressResult {
  /** 0–100, or null when no input exists at all. */
  score: number | null;
  level: "no-data" | "Low" | "Moderate" | "High" | "Very high";
  factors: StressFactor[];
  /** Keys of factors that had no data. */
  missing: string[];
  /** Fraction of the five inputs that were present (0–1). */
  confidence: number;
  suggestions: string[];
  disclaimer: string;
}

export interface StressInputs {
  mood: { stress_score?: number | null; created_at?: string }[];
  workload: { hours?: number | null; intensity?: number | null; created_at?: string }[];
  tasks: { status?: string; priority?: string | null; due_date?: string | null; created_at?: string }[];
  study: { duration_minutes?: number | null; created_at?: string }[];
  /** Recent user chat messages (plain text). */
  chatTexts: string[];
  /** "now" for the 7-day window; defaults to the real current time. */
  now?: Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const num = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
function withinDays(createdAt: string | undefined, nowMs: number, days: number): boolean {
  if (!createdAt) return true; // undated rows still count (caller filters by recency where possible)
  const t = Date.parse(createdAt);
  if (!Number.isFinite(t)) return true;
  return t >= nowMs - days * DAY_MS && t <= nowMs + DAY_MS;
}
function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Keyword mood reading of chat text. Pure and testable. */
export function chatMoodScore(texts: string[]): { score: number; stressHits: number; calmHits: number; sampleCount: number } {
  const joined = texts.join(" ").toLowerCase();
  let stressHits = 0;
  for (const w of STRESS_WORDS) if (joined.includes(w)) stressHits++;
  let calmHits = 0;
  for (const w of CALM_WORDS) if (joined.includes(w)) calmHits++;
  const score = clamp(50 + 10 * (stressHits - calmHits), 0, 100);
  return { score, stressHits, calmHits, sampleCount: texts.length };
}

const SUGGESTIONS: Record<string, string> = {
  selfReport:
    "Your self-reported stress is the biggest driver right now. Take a real break today, and if it keeps feeling high, talk to someone you trust.",
  workload:
    "Your logged workload is heavy. Shorten today's list to the essentials and schedule short breaks between blocks.",
  tasks:
    "Open and overdue tasks are piling up. Pick the single most urgent one, do it first, and move the rest to a later date.",
  study:
    "Study hours are high this week. Break study into shorter blocks (for example 25 minutes with a 5-minute break) instead of long sessions.",
  chat:
    "Your recent chats sound strained. Try writing down what's weighing on you in chat — naming it often makes the next step clearer.",
};

export function stressLevel(score: number | null): StressResult["level"] {
  if (score === null) return "no-data";
  if (score < 30) return "Low";
  if (score < 50) return "Moderate";
  if (score < 70) return "High";
  return "Very high";
}

export function computeStressScore(input: StressInputs): StressResult {
  const nowMs = (input.now ? new Date(input.now) : new Date()).getTime();
  const today = dayKey(new Date(nowMs));
  const mood = (input.mood || []).filter((m) => withinDays(m.created_at, nowMs, 7));
  const workload = (input.workload || []).filter((w) => withinDays(w.created_at, nowMs, 7));
  const study = (input.study || []).filter((s) => withinDays(s.created_at, nowMs, 7));
  const tasks = input.tasks || [];
  const chatTexts = (input.chatTexts || []).filter((t) => t && t.trim());

  const factors: StressFactor[] = [];

  // 1. Self-reported stress — weight 30
  const stressVals = mood.map((m) => num(m.stress_score)).filter((n): n is number => n !== null);
  if (stressVals.length) {
    const avg = stressVals.reduce((a, b) => a + b, 0) / stressVals.length;
    const value = clamp(Math.round(avg * 10), 0, 100);
    factors.push({ key: "selfReport", label: "Self-reported stress", weight: 30, value, contribution: value * 30, detail: `Average stress ${avg.toFixed(1)}/10 across ${stressVals.length} check-in${stressVals.length === 1 ? "" : "s"} in the last 7 days.`, missing: false });
  } else {
    factors.push({ key: "selfReport", label: "Self-reported stress", weight: 30, value: null, contribution: 0, detail: "No mood check-ins in the last 7 days.", missing: true });
  }

  // 2. Workload — weight 25
  const intensities = workload.map((w) => num(w.intensity)).filter((n): n is number => n !== null);
  const totalHours = workload.reduce((s, w) => s + (num(w.hours) || 0), 0);
  if (intensities.length || totalHours > 0) {
    const avgI = intensities.length ? intensities.reduce((a, b) => a + b, 0) / intensities.length : 0;
    const value = clamp(Math.round(0.6 * avgI * 10 + 0.4 * (Math.min(totalHours, 60) / 60) * 100), 0, 100);
    factors.push({ key: "workload", label: "Workload", weight: 25, value, contribution: value * 25, detail: `${totalHours.toFixed(1)}h logged in the last 7 days, average intensity ${intensities.length ? avgI.toFixed(1) : "—"}/10.`, missing: false });
  } else {
    factors.push({ key: "workload", label: "Workload", weight: 25, value: null, contribution: 0, detail: "No workload entries in the last 7 days.", missing: true });
  }

  // 3. Task pressure — weight 20 (always computable from the current list)
  const open = tasks.filter((t) => (t.status || "") !== "done");
  const overdue = open.filter((t) => t.due_date && t.due_date.slice(0, 10) < today).length;
  const dueSoonHigh = open.filter((t) => {
    if ((t.priority || "") !== "high" || !t.due_date) return false;
    const d = t.due_date.slice(0, 10);
    return d >= today && d <= dayKey(new Date(nowMs + 2 * DAY_MS));
  }).length;
  if (tasks.length) {
    const taskValue = clamp(overdue * 20 + dueSoonHigh * 10 + open.length * 2, 0, 100);
    factors.push({ key: "tasks", label: "Task pressure", weight: 20, value: taskValue, contribution: taskValue * 20, detail: `${open.length} open task${open.length === 1 ? "" : "s"}, ${overdue} overdue, ${dueSoonHigh} high-priority due in the next 2 days.`, missing: false });
  } else {
    factors.push({ key: "tasks", label: "Task pressure", weight: 20, value: null, contribution: 0, detail: "No tasks recorded.", missing: true });
  }

  // 4. Study load — weight 10
  const totalMinutes = study.reduce((s, x) => s + (num(x.duration_minutes) || 0), 0);
  if (study.length) {
    const value = clamp(Math.round((totalMinutes / 2520) * 100), 0, 100);
    factors.push({ key: "study", label: "Study load", weight: 10, value, contribution: value * 10, detail: `${totalMinutes} study minutes logged in the last 7 days.`, missing: false });
  } else {
    factors.push({ key: "study", label: "Study load", weight: 10, value: null, contribution: 0, detail: "No study sessions logged in the last 7 days.", missing: true });
  }

  // 5. Chat mood (keywords) — weight 15
  if (chatTexts.length) {
    const m = chatMoodScore(chatTexts);
    factors.push({ key: "chat", label: "Chat mood (keywords)", weight: 15, value: m.score, contribution: m.score * 15, detail: `${m.stressHits} stress word${m.stressHits === 1 ? "" : "s"} and ${m.calmHits} calm word${m.calmHits === 1 ? "" : "s"} in your last ${m.sampleCount} message${m.sampleCount === 1 ? "" : "s"}.`, missing: false });
  } else {
    factors.push({ key: "chat", label: "Chat mood (keywords)", weight: 15, value: null, contribution: 0, detail: "No recent chat messages to read.", missing: true });
  }

  const present = factors.filter((f) => !f.missing);
  const missing = factors.filter((f) => f.missing).map((f) => f.key);
  const weightSum = present.reduce((s, f) => s + f.weight, 0);
  const score = present.length
    ? Math.round(present.reduce((s, f) => s + f.contribution, 0) / weightSum)
    : null;
  const ranked = [...present].sort((a, b) => b.contribution - a.contribution);
  const suggestions =
    score === null
      ? ["No data yet — log a mood check-in, some workload, or chat with EDITH, and your first stress estimate will appear here."]
      : ranked.slice(0, 3).map((f) => SUGGESTIONS[f.key]).filter(Boolean);
  return {
    score,
    level: stressLevel(score),
    factors,
    missing,
    confidence: present.length / factors.length,
    suggestions,
    disclaimer: STRESS_DISCLAIMER,
  };
}

/** One score per day for the last `days` days (chat factor excluded — its texts carry no per-day date here). */
export function computeDailyTrend(input: StressInputs, days = 7): { date: string; score: number | null }[] {
  const nowMs = (input.now ? new Date(input.now) : new Date()).getTime();
  const out: { date: string; score: number | null }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(nowMs - i * DAY_MS);
    const key = dayKey(day);
    const dayStart = new Date(`${key}T00:00:00.000Z`).getTime();
    const dayEnd = dayStart + DAY_MS;
    const inDay = (createdAt?: string) => {
      if (!createdAt) return false;
      const t = Date.parse(createdAt);
      return Number.isFinite(t) && t >= dayStart && t < dayEnd;
    };
    const dayTasks = (input.tasks || []).filter((t) => {
      const created = t.created_at ? Date.parse(t.created_at) : NaN;
      const createdOk = !t.created_at || (Number.isFinite(created) && created < dayEnd);
      return createdOk && (t.status || "") !== "done" && t.due_date && t.due_date.slice(0, 10) <= key;
    });
    const r = computeStressScore({
      mood: (input.mood || []).filter((m) => inDay(m.created_at)),
      workload: (input.workload || []).filter((w) => inDay(w.created_at)),
      // Tasks are re-scored as-of this day; chat is excluded from the trend.
      tasks: dayTasks,
      study: (input.study || []).filter((s) => inDay(s.created_at)),
      chatTexts: [],
      now: day,
    });
    // computeStressScore treats an empty day as no-data only when nothing
    // is present; with tasks always present the day always has a score.
    out.push({ date: key, score: r.score });
  }
  return out;
}
