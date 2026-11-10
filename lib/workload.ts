/**
 * Automatic workload analysis — workload the app works out by itself.
 *
 * Unlike the manual workload log (workload_entries, still usable on the
 * /workload page), this is derived ONLY from activity the app already
 * records for the signed-in user: tasks created/completed/open, study
 * sessions, their own chat messages, and mood check-ins, plus manual
 * workload entries when they exist. Nothing is typed in for this report.
 *
 * Formula (weights sum to 100; missing sources are excluded and the
 * remaining weights are renormalised, so a score is never built from
 * invented data):
 *
 *   source                     weight   value (0–100)
 *   -------------------------  ------   --------------------------------
 *   tasks                      30       min(100, completed×6 + created×4
 *                                        + open×2 + overdue×12
 *                                        + due-soon high×6)
 *   study                      25       min(100, study minutes / 2520 × 100)
 *                                        (2520 min = 42 h/week cap)
 *   chat activity              20       min(100, messages×3
 *                                        + pressure-word hits×4)
 *   mood (self-reported)       15       avg stress_score (1–10) × 10
 *   manual workload entries    10       same as lib/stress.ts: 0.6 × avg
 *                                        intensity × 10 + 0.4 ×
 *                                        min(total hours, 60)/60 × 100
 *
 * Window: the last 7 days for the report, with the previous 7 days used
 * for the trend. Per-day totals use the same day's tasks created +
 * completed, study minutes and chat messages. Level bands match stress:
 * 0–29 Low, 30–49 Moderate, 50–69 High, 70–100 Very high.
 *
 * Pressure words come from STRESS_WORDS in lib/stress.ts (imported, not
 * duplicated). This is an ESTIMATE from app activity — explicitly NOT a
 * medical diagnosis or clinical assessment.
 */
import { STRESS_WORDS } from "./stress";

export const WORKLOAD_DISCLAIMER =
  "Estimate from your own app activity in the last 7 days — not a medical diagnosis or clinical assessment.";

export interface WorkloadSource {
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

export interface WorkloadDay {
  date: string;
  /** 0–100 daily activity score (0 when nothing happened that day). */
  score: number;
  tasksCreated: number;
  tasksCompleted: number;
  studyMinutes: number;
  messages: number;
}

export interface WorkloadTrend {
  direction: "up" | "down" | "flat";
  /** This week's average daily score minus last week's (rounded). */
  delta: number;
  thisWeekAvg: number;
  prevWeekAvg: number;
}

export interface WorkloadResult {
  /** 0–100, or null when no activity exists at all. */
  score: number | null;
  level: "no-data" | "Low" | "Moderate" | "High" | "Very high";
  sources: WorkloadSource[];
  /** Keys of sources that had no data. */
  missing: string[];
  /** Fraction of the five inputs that were present (0–1). */
  confidence: number;
  daily: WorkloadDay[];
  /** Date of the busiest day, or null when every day was empty. */
  busiestDay: string | null;
  trend: WorkloadTrend;
  /** Short human-readable highlights, e.g. "12 tasks completed". */
  signals: string[];
  disclaimer: string;
}

export interface WorkloadInputs {
  tasks: { status?: string; priority?: string | null; due_date?: string | null; created_at?: string; updated_at?: string | null }[];
  study: { duration_minutes?: number | null; created_at?: string }[];
  /** Recent user chat messages with their timestamps. */
  messages: { content?: string | null; created_at?: string }[];
  mood: { stress_score?: number | null; created_at?: string }[];
  workload: { hours?: number | null; intensity?: number | null; created_at?: string }[];
  /** "now" for the 7-day window; defaults to the real current time. */
  now?: Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const num = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function withinWindow(createdAt: string | undefined | null, startMs: number, endMs: number): boolean {
  if (!createdAt) return false;
  const t = Date.parse(createdAt);
  return Number.isFinite(t) && t >= startMs && t < endMs;
}

/** Distinct pressure words present in the given texts (same list as stress). */
export function pressureWordHits(texts: string[]): number {
  const joined = texts.join(" ").toLowerCase();
  let hits = 0;
  for (const w of STRESS_WORDS) if (joined.includes(w)) hits++;
  return hits;
}

export function workloadLevel(score: number | null): WorkloadResult["level"] {
  if (score === null) return "no-data";
  if (score < 30) return "Low";
  if (score < 50) return "Moderate";
  if (score < 70) return "High";
  return "Very high";
}

function dayScore(d: { tasksCreated: number; tasksCompleted: number; studyMinutes: number; messages: number }): number {
  return clamp(
    8 * (d.tasksCreated + d.tasksCompleted) + d.studyMinutes / 4 + 5 * d.messages,
    0,
    100,
  );
}

export function computeWorkloadAnalysis(input: WorkloadInputs): WorkloadResult {
  const nowMs = (input.now ? new Date(input.now) : new Date()).getTime();
  const today = dayKey(new Date(nowMs));
  const weekStart = nowMs - 7 * DAY_MS;
  const prevStart = nowMs - 14 * DAY_MS;

  const tasks = input.tasks || [];
  const study = (input.study || []).filter((s) => withinWindow(s.created_at, weekStart, nowMs + DAY_MS));
  const messages = (input.messages || []).filter((m) => m.content && m.content.trim());
  const weekMessages = messages.filter((m) => withinWindow(m.created_at, weekStart, nowMs + DAY_MS));
  const mood = (input.mood || []).filter((m) => withinWindow(m.created_at, weekStart, nowMs + DAY_MS));
  const workload = (input.workload || []).filter((w) => withinWindow(w.created_at, weekStart, nowMs + DAY_MS));

  const sources: WorkloadSource[] = [];

  // 1. Tasks — weight 30. Created/completed in the last 7 days plus the
  //    current open load (overdue and high-priority due soon).
  const createdWeek = tasks.filter((t) => withinWindow(t.created_at, weekStart, nowMs + DAY_MS));
  const completedWeek = tasks.filter(
    (t) => (t.status || "") === "done" && withinWindow(t.updated_at || t.created_at, weekStart, nowMs + DAY_MS),
  );
  const open = tasks.filter((t) => (t.status || "") !== "done");
  const overdue = open.filter((t) => t.due_date && t.due_date.slice(0, 10) < today).length;
  const dueSoonHigh = open.filter((t) => {
    if ((t.priority || "") !== "high" || !t.due_date) return false;
    const d = t.due_date.slice(0, 10);
    return d >= today && d <= dayKey(new Date(nowMs + 2 * DAY_MS));
  }).length;
  if (createdWeek.length || completedWeek.length || open.length) {
    const value = clamp(
      completedWeek.length * 6 + createdWeek.length * 4 + open.length * 2 + overdue * 12 + dueSoonHigh * 6,
      0,
      100,
    );
    sources.push({
      key: "tasks",
      label: "Tasks",
      weight: 30,
      value,
      contribution: value * 30,
      detail: `${completedWeek.length} completed, ${createdWeek.length} created in the last 7 days; ${open.length} open, ${overdue} overdue, ${dueSoonHigh} high-priority due in the next 2 days.`,
      missing: false,
    });
  } else {
    sources.push({ key: "tasks", label: "Tasks", weight: 30, value: null, contribution: 0, detail: "No tasks recorded.", missing: true });
  }

  // 2. Study — weight 25.
  const totalMinutes = study.reduce((s, x) => s + (num(x.duration_minutes) || 0), 0);
  if (study.length) {
    const value = clamp(Math.round((totalMinutes / 2520) * 100), 0, 100);
    sources.push({ key: "study", label: "Study", weight: 25, value, contribution: value * 25, detail: `${totalMinutes} study minutes in the last 7 days.`, missing: false });
  } else {
    sources.push({ key: "study", label: "Study", weight: 25, value: null, contribution: 0, detail: "No study sessions in the last 7 days.", missing: true });
  }

  // 3. Chat activity — weight 20.
  if (weekMessages.length) {
    const texts = weekMessages.map((m) => m.content as string);
    const hits = pressureWordHits(texts);
    const value = clamp(weekMessages.length * 3 + hits * 4, 0, 100);
    sources.push({
      key: "chat",
      label: "Chat activity",
      weight: 20,
      value,
      contribution: value * 20,
      detail: `${weekMessages.length} message${weekMessages.length === 1 ? "" : "s"} in the last 7 days, ${hits} pressure word${hits === 1 ? "" : "s"} in them.`,
      missing: false,
    });
  } else {
    sources.push({ key: "chat", label: "Chat activity", weight: 20, value: null, contribution: 0, detail: "No chat messages in the last 7 days.", missing: true });
  }

  // 4. Mood (self-reported stress) — weight 15.
  const stressVals = mood.map((m) => num(m.stress_score)).filter((n): n is number => n !== null);
  if (stressVals.length) {
    const avg = stressVals.reduce((a, b) => a + b, 0) / stressVals.length;
    const value = clamp(Math.round(avg * 10), 0, 100);
    sources.push({ key: "mood", label: "Mood (self-reported)", weight: 15, value, contribution: value * 15, detail: `Average stress ${avg.toFixed(1)}/10 across ${stressVals.length} check-in${stressVals.length === 1 ? "" : "s"} in the last 7 days.`, missing: false });
  } else {
    sources.push({ key: "mood", label: "Mood (self-reported)", weight: 15, value: null, contribution: 0, detail: "No mood check-ins in the last 7 days.", missing: true });
  }

  // 5. Manual workload entries — weight 10, optional extra source.
  const intensities = workload.map((w) => num(w.intensity)).filter((n): n is number => n !== null);
  const totalHours = workload.reduce((s, w) => s + (num(w.hours) || 0), 0);
  if (intensities.length || totalHours > 0) {
    const avgI = intensities.length ? intensities.reduce((a, b) => a + b, 0) / intensities.length : 0;
    const value = clamp(Math.round(0.6 * avgI * 10 + 0.4 * (Math.min(totalHours, 60) / 60) * 100), 0, 100);
    sources.push({ key: "manual", label: "Manual workload log", weight: 10, value, contribution: value * 10, detail: `${totalHours.toFixed(1)}h logged in the last 7 days, average intensity ${intensities.length ? avgI.toFixed(1) : "—"}/10.`, missing: false });
  } else {
    sources.push({ key: "manual", label: "Manual workload log", weight: 10, value: null, contribution: 0, detail: "No manual workload entries in the last 7 days (optional — the report does not need them).", missing: true });
  }

  // Per-day totals for the last 7 days (oldest first).
  const daily: WorkloadDay[] = [];
  for (let i = 6; i >= 0; i--) {
    const day = new Date(nowMs - i * DAY_MS);
    const key = dayKey(day);
    const dayStart = new Date(`${key}T00:00:00.000Z`).getTime();
    const dayEnd = dayStart + DAY_MS;
    const d = {
      date: key,
      tasksCreated: tasks.filter((t) => withinWindow(t.created_at, dayStart, dayEnd)).length,
      tasksCompleted: tasks.filter((t) => (t.status || "") === "done" && withinWindow(t.updated_at || t.created_at, dayStart, dayEnd)).length,
      studyMinutes: study.filter((s) => withinWindow(s.created_at, dayStart, dayEnd)).reduce((s, x) => s + (num(x.duration_minutes) || 0), 0),
      messages: weekMessages.filter((m) => withinWindow(m.created_at, dayStart, dayEnd)).length,
    };
    daily.push({ ...d, score: dayScore(d) });
  }

  // Trend vs the previous 7 days, using the same daily score.
  const prevDaily: number[] = [];
  for (let i = 13; i >= 7; i--) {
    const day = new Date(nowMs - i * DAY_MS);
    const key = dayKey(day);
    const dayStart = new Date(`${key}T00:00:00.000Z`).getTime();
    const dayEnd = dayStart + DAY_MS;
    prevDaily.push(dayScore({
      tasksCreated: tasks.filter((t) => withinWindow(t.created_at, dayStart, dayEnd)).length,
      tasksCompleted: tasks.filter((t) => (t.status || "") === "done" && withinWindow(t.updated_at || t.created_at, dayStart, dayEnd)).length,
      studyMinutes: (input.study || []).filter((s) => withinWindow(s.created_at, dayStart, dayEnd)).reduce((s, x) => s + (num(x.duration_minutes) || 0), 0),
      messages: messages.filter((m) => withinWindow(m.created_at, dayStart, dayEnd)).length,
    }));
  }
  const round1 = (n: number) => Math.round(n * 10) / 10;
  const thisWeekAvg = round1(daily.reduce((s, d) => s + d.score, 0) / 7);
  const prevWeekAvg = round1(prevDaily.reduce((s, n) => s + n, 0) / 7);
  const delta = round1(thisWeekAvg - prevWeekAvg);
  const trend: WorkloadTrend = {
    direction: Math.abs(delta) < 5 ? "flat" : delta > 0 ? "up" : "down",
    delta,
    thisWeekAvg,
    prevWeekAvg,
  };

  const busiest = daily.reduce<WorkloadDay | null>((best, d) => (d.score > 0 && (!best || d.score > best.score) ? d : best), null);

  const present = sources.filter((f) => !f.missing);
  const missing = sources.filter((f) => f.missing).map((f) => f.key);
  const weightSum = present.reduce((s, f) => s + f.weight, 0);
  const score = present.length
    ? Math.round(present.reduce((s, f) => s + f.contribution, 0) / weightSum)
    : null;

  const signals: string[] = [];
  if (completedWeek.length) signals.push(`${completedWeek.length} task${completedWeek.length === 1 ? "" : "s"} completed`);
  if (createdWeek.length) signals.push(`${createdWeek.length} task${createdWeek.length === 1 ? "" : "s"} created`);
  if (totalMinutes) signals.push(`${totalMinutes} study minutes`);
  if (weekMessages.length) signals.push(`${weekMessages.length} chat message${weekMessages.length === 1 ? "" : "s"}`);
  const hits = weekMessages.length ? pressureWordHits(weekMessages.map((m) => m.content as string)) : 0;
  if (hits) signals.push(`${hits} pressure word${hits === 1 ? "" : "s"} in your chats`);
  if (overdue) signals.push(`${overdue} task${overdue === 1 ? "" : "s"} overdue`);
  if (totalHours > 0) signals.push(`${totalHours.toFixed(1)}h manually logged`);

  return {
    score,
    level: workloadLevel(score),
    sources,
    missing,
    confidence: present.length / sources.length,
    daily,
    busiestDay: busiest ? busiest.date : null,
    trend,
    signals,
    disclaimer: WORKLOAD_DISCLAIMER,
  };
}

/** Deterministic template report from the same aggregates (no AI needed). */
export function templateWorkloadReport(r: WorkloadResult): string {
  if (r.score === null) {
    return "No activity yet — chat, log tasks or study, and your first workload report will appear here.";
  }
  const top = [...r.sources].filter((s) => !s.missing).sort((a, b) => b.contribution - a.contribution)[0];
  const trendText =
    r.trend.direction === "flat"
      ? "about the same as last week"
      : r.trend.direction === "up"
        ? `${Math.abs(r.trend.delta)} points busier than last week`
        : `${Math.abs(r.trend.delta)} points quieter than last week`;
  const busy = r.busiestDay ? ` Your busiest day was ${r.busiestDay}.` : "";
  const driver = top ? ` ${top.label} drove most of it (${top.detail})` : "";
  const suggestion =
    r.score >= 70
      ? "Try cutting today's list to the essentials and taking a real break between blocks."
      : r.score >= 50
        ? "Consider spreading the busiest days out and scheduling short breaks between blocks."
        : "Your load looks manageable this week — a good time to get ahead on the next thing.";
  return (
    `Your workload this week is ${r.level.toLowerCase()} (${r.score}/100), ${trendText}.${driver}${busy} ` +
    `${r.signals.length ? `Top signals: ${r.signals.join(", ")}.` : ""} ${suggestion}`
  );
}
