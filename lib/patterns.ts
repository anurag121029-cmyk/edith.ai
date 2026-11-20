/**
 * Daily understanding — the engine that turns EDITH from a stress meter
 * you check while using it into a personal assistant that understands
 * the user's days.
 *
 * Computed ONLY from the signed-in user's own last 28 days of app
 * activity: tasks, study sessions, their own chat messages, mood
 * check-ins and manual workload entries. Pure and deterministic — no
 * network, no AI, no new dependencies.
 *
 * Daily series: one entry per day for the last 28 days. Every value is
 * nullable — a day with no data stays null, never invented.
 *
 *   stress    per-day stress estimate, reusing lib/stress.ts
 *             computeDailyTrend (the same formula as the stress page,
 *             never duplicated here)
 *   workload  per-day activity score, reusing lib/workload.ts
 *             workloadDayScore (the same formula as the workload
 *             report); null on a day with no activity at all
 *   mood      average mood_score that day × 10 (1–10 → 0–100),
 *             null when no check-in that day
 *   wellbeing daily wellbeing score (see below), null when none of
 *             its three inputs is known that day
 *
 * Wellbeing formula (weights sum to 100; missing inputs are excluded
 * and the remaining weights are renormalised, exactly like
 * lib/stress.ts, so a score is never built from invented data):
 *
 *   input                    weight   value (0–100)
 *   -----------------------  ------   --------------------------------
 *   inverted stress          40       100 − stress
 *   inverted workload        30       100 − workload
 *   mood                     30       mood (mood_score × 10)
 *
 * Higher wellbeing = better. A day with only mood known scores on mood
 * alone; a day with nothing known scores null.
 *
 * Trends compare the last 7 days with the previous 7 (means of the
 * days that have a value). Direction is "rising"/"falling"/"flat"
 * (|delta| < 5 is flat, same threshold as lib/workload.ts). Streak is
 * consecutive day-to-day moves in the trend's direction ending today,
 * capped at 7. Volatility is the standard deviation of the last 7
 * days' values (null with fewer than 2 values).
 *
 * Patterns: busiest hours of day (UTC) by activity count, hardest and
 * calmest weekday by average daily load (mean of that day's stress and
 * workload, whichever is known), most active weekday by event count.
 *
 * Recovery is a plain fact, not a score input: how many of the last 7
 * days were low-activity days (daily workload score < 30). A day with
 * no recorded activity has no workload score, so it does not count —
 * absence of data is not evidence of rest.
 *
 * Alerts only fire when the data supports them, and the briefing is a
 * deterministic template built from the real patterns — no AI needed.
 *
 * This is an ESTIMATE from the user's own app activity. It is
 * explicitly NOT a medical diagnosis or clinical assessment — the
 * score, the API route and every UI surface that shows it must say so.
 */
import { computeDailyTrend } from "./stress";
import { workloadDayScore } from "./workload";

export const PATTERNS_DISCLAIMER =
  "Estimates from your own app activity in the last 28 days — not a medical diagnosis or clinical assessment.";

export const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export interface PatternDay {
  date: string;
  /** 0–100, or null when the day has no stress data. */
  stress: number | null;
  /** 0–100, or null when the day has no activity at all. */
  workload: number | null;
  /** 0–100 (mood_score × 10), or null when no check-in that day. */
  mood: number | null;
  /** 0–100, or null when none of its inputs is known that day. */
  wellbeing: number | null;
}

export interface MetricTrend {
  direction: "rising" | "falling" | "flat";
  /** This week's mean minus last week's mean (1 decimal), null when either week has no values. */
  delta: number | null;
  /** Consecutive day-to-day moves in the trend's direction ending today, max 7. */
  streak: number;
  /** Standard deviation of the last 7 days' values (1 decimal), null with fewer than 2 values. */
  volatility: number | null;
  thisWeekAvg: number | null;
  prevWeekAvg: number | null;
}

export interface BusiestHour {
  /** Hour of day, 0–23 (UTC). */
  hour: number;
  label: string;
  count: number;
}

export interface WellbeingComponent {
  key: string;
  label: string;
  weight: number;
  /** 0–100, or null when the input was missing. */
  value: number | null;
  detail: string;
  missing: boolean;
}

export interface PatternAlert {
  key: string;
  kind: "warning" | "info" | "positive";
  text: string;
}

export interface PatternResult {
  /** Today's entry (the last day of the series). */
  today: PatternDay;
  series: PatternDay[];
  trends: { stress: MetricTrend; workload: MetricTrend; mood: MetricTrend };
  patterns: {
    busiestHours: BusiestHour[];
    /** IANA timezone the busiest hours are shown in. */
    timeZone: string;
    hardestWeekday: string | null;
    hardestWeekdayLoad: number | null;
    calmestWeekday: string | null;
    calmestWeekdayLoad: number | null;
    mostActiveWeekday: string | null;
    mostActiveWeekdayCount: number;
  };
  wellbeing: {
    /** Today's wellbeing score (same as today.wellbeing). */
    today: number | null;
    /** Mean of the last 7 days' wellbeing values, null when none. */
    average7: number | null;
    /** Today's components (inverted stress / inverted workload / mood). */
    components: WellbeingComponent[];
    /** Low-activity days in the last 7 (daily workload score < 30). */
    lowActivityDays: number;
    /** Consecutive low-activity days ending today, max 7. */
    lowActivityStreak: number;
  };
  /** Today's open tasks due today (titles only, for the briefing). */
  todayTasks: { title: string }[];
  alerts: PatternAlert[];
  briefing: string;
  /** True when any data exists in the 28-day window. */
  hasData: boolean;
  disclaimer: string;
}

export interface PatternInputs {
  tasks: { status?: string; priority?: string | null; due_date?: string | null; created_at?: string; updated_at?: string | null; title?: string }[];
  study: { duration_minutes?: number | null; created_at?: string }[];
  /** User chat messages (content is only counted, never read for wording here). */
  messages: { content?: string | null; created_at?: string }[];
  mood: { stress_score?: number | null; mood_score?: number | null; created_at?: string }[];
  workload: { hours?: number | null; intensity?: number | null; created_at?: string }[];
  /** "now" for the 28-day window; defaults to the real current time. */
  now?: Date;
  /** IANA timezone used for "busiest hours" (e.g. "Asia/Kolkata"); defaults to "UTC". */
  timeZone?: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const num = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const round1 = (n: number) => Math.round(n * 10) / 10;
function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function withinWindow(createdAt: string | undefined | null, startMs: number, endMs: number): boolean {
  if (!createdAt) return false;
  const t = Date.parse(createdAt);
  return Number.isFinite(t) && t >= startMs && t < endMs;
}
function hourLabel(hour: number): string {
  if (hour === 0) return "12am";
  if (hour < 12) return `${hour}am`;
  if (hour === 12) return "12pm";
  return `${hour - 12}pm`;
}
/** Hour of day (0–23) for a timestamp in the given IANA timezone; "UTC" when invalid. */
export function resolveTimeZone(tz: string | undefined): string {
  if (!tz) return "UTC";
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: tz });
    return tz;
  } catch {
    return "UTC";
  }
}
function hourInZone(ms: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "numeric", hourCycle: "h23" }).formatToParts(new Date(ms));
  const h = Number(parts.find((p) => p.type === "hour")?.value);
  return Number.isFinite(h) ? h : new Date(ms).getUTCHours();
}
function mean(vals: number[]): number | null {
  return vals.length ? round1(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
}
function stddev(vals: number[]): number | null {
  if (vals.length < 2) return null;
  const m = vals.reduce((a, b) => a + b, 0) / vals.length;
  const v = vals.reduce((s, x) => s + (x - m) * (x - m), 0) / vals.length;
  return round1(Math.sqrt(v));
}

/** Wellbeing for one day from its stress/workload/mood (each 0–100 or null). */
export function computeWellbeing(
  stress: number | null,
  workload: number | null,
  mood: number | null,
): { score: number | null; components: WellbeingComponent[] } {
  const components: WellbeingComponent[] = [
    {
      key: "stress",
      label: "Low stress",
      weight: 40,
      value: stress === null ? null : clamp(100 - stress, 0, 100),
      detail: stress === null ? "No stress reading that day." : `Stress ${stress}/100 that day.`,
      missing: stress === null,
    },
    {
      key: "workload",
      label: "Lighter load",
      weight: 30,
      value: workload === null ? null : clamp(100 - workload, 0, 100),
      detail: workload === null ? "No activity recorded that day." : `Workload ${workload}/100 that day.`,
      missing: workload === null,
    },
    {
      key: "mood",
      label: "Mood",
      weight: 30,
      value: mood,
      detail: mood === null ? "No mood check-in that day." : `Mood ${mood}/100 that day.`,
      missing: mood === null,
    },
  ];
  const present = components.filter((c) => !c.missing);
  if (!present.length) return { score: null, components };
  const weightSum = present.reduce((s, c) => s + c.weight, 0);
  const score = Math.round(present.reduce((s, c) => s + (c.value as number) * c.weight, 0) / weightSum);
  return { score, components };
}

function computeTrend(values: (number | null)[]): MetricTrend {
  // values: 28 daily values, oldest first. Last 7 vs previous 7.
  const thisWeek = values.slice(-7).filter((v): v is number => v !== null);
  const prevWeek = values.slice(-14, -7).filter((v): v is number => v !== null);
  const thisWeekAvg = mean(thisWeek);
  const prevWeekAvg = mean(prevWeek);
  const delta = thisWeekAvg === null || prevWeekAvg === null ? null : round1(thisWeekAvg - prevWeekAvg);
  const direction: MetricTrend["direction"] =
    delta === null || Math.abs(delta) < 5 ? "flat" : delta > 0 ? "rising" : "falling";
  // Streak: consecutive day-to-day moves in the trend's direction,
  // walking backwards from the latest value. Capped at 7.
  let streak = 0;
  if (direction !== "flat") {
    const known = values.filter((v): v is number => v !== null);
    for (let i = known.length - 1; i > 0 && streak < 7; i--) {
      const move = known[i] - known[i - 1];
      if ((direction === "rising" && move > 0) || (direction === "falling" && move < 0)) streak++;
      else break;
    }
  }
  return { direction, delta, streak, volatility: stddev(thisWeek), thisWeekAvg, prevWeekAvg };
}

/** Deterministic template briefing from the computed result. No AI needed. */
export function templateBriefing(r: PatternResult): string {
  if (!r.hasData) {
    return "No activity yet — chat, log tasks or study, and EDITH will start learning what your days usually look like.";
  }
  const todayName = WEEKDAY_NAMES[new Date(`${r.today.date}T12:00:00.000Z`).getUTCDay()];
  const parts: string[] = [];
  let todayLine = `Today is ${todayName}.`;
  if (r.patterns.hardestWeekday === todayName && r.patterns.hardestWeekdayLoad !== null) {
    todayLine += ` ${todayName}s are usually your hardest day — your average load then is ${r.patterns.hardestWeekdayLoad}/100, so plan the tough stuff early and keep a break in the middle.`;
  } else if (r.patterns.calmestWeekday === todayName && r.patterns.calmestWeekdayLoad !== null) {
    todayLine += ` ${todayName}s are usually your calmest day — a good day to get ahead on the next thing.`;
  } else if (r.patterns.hardestWeekday) {
    todayLine += ` ${r.patterns.hardestWeekday}s are usually your hardest day, so keep today lighter if you can.`;
  }
  parts.push(todayLine);
  if (r.wellbeing.today !== null) {
    parts.push(`Your wellbeing estimate today is ${r.wellbeing.today}/100.`);
  } else {
    parts.push("No wellbeing estimate for today yet — a quick mood check-in would complete the picture.");
  }
  if (r.trends.stress.direction === "rising" && r.trends.stress.streak >= 2) {
    parts.push(`Watch your stress: it has risen ${r.trends.stress.streak} days in a row.`);
  } else if (r.trends.stress.direction === "falling") {
    parts.push("Your stress has been easing over the last week.");
  }
  if (r.trends.workload.delta !== null && r.trends.workload.delta > 15) {
    parts.push(`Your workload is up ${r.trends.workload.delta} points on last week — consider spreading it out.`);
  }
  if (r.todayTasks.length) {
    const names = r.todayTasks.slice(0, 2).map((t) => t.title).join(", ");
    const more = r.todayTasks.length > 2 ? ` and ${r.todayTasks.length - 2} more` : "";
    parts.push(`You have ${r.todayTasks.length} task${r.todayTasks.length === 1 ? "" : "s"} due today: ${names}${more}.`);
  } else {
    parts.push("Nothing is due today.");
  }
  if (r.patterns.busiestHours.length) {
    const hours = r.patterns.busiestHours.map((h) => h.label).join(", ");
    parts.push(`You are usually most active around ${hours}.`);
  }
  return parts.join(" ");
}

export function computePatterns(input: PatternInputs): PatternResult {
  const nowMs = (input.now ? new Date(input.now) : new Date()).getTime();
  const today = dayKey(new Date(nowMs));
  const windowStart = nowMs - 28 * DAY_MS;

  const tasks = input.tasks || [];
  const study = input.study || [];
  const messages = (input.messages || []).filter((m) => m.content && m.content.trim());
  const mood = input.mood || [];
  const workload = input.workload || [];

  // Per-day stress reuses the real stress formula (lib/stress.ts).
  const stressTrend = computeDailyTrend(
    {
      mood: mood as never,
      workload: workload as never,
      tasks: tasks as never,
      study: study as never,
      chatTexts: [],
      now: input.now,
    },
    28,
  );
  const stressByDay = new Map(stressTrend.map((d) => [d.date, d.score]));

  // Per-day activity counts for the workload score and the patterns.
  const series: PatternDay[] = [];
  const activityByDay = new Map<string, number>(); // events per day, for recovery
  for (let i = 27; i >= 0; i--) {
    const day = new Date(nowMs - i * DAY_MS);
    const key = dayKey(day);
    const dayStart = new Date(`${key}T00:00:00.000Z`).getTime();
    const dayEnd = dayStart + DAY_MS;
    const dayMood = mood.filter((m) => withinWindow(m.created_at, dayStart, dayEnd));
    const moodVals = dayMood.map((m) => num(m.mood_score)).filter((n): n is number => n !== null);
    const dayMoodScore = moodVals.length ? Math.round((moodVals.reduce((a, b) => a + b, 0) / moodVals.length) * 10) : null;
    const counts = {
      tasksCreated: tasks.filter((t) => withinWindow(t.created_at, dayStart, dayEnd)).length,
      tasksCompleted: tasks.filter((t) => (t.status || "") === "done" && withinWindow(t.updated_at || t.created_at, dayStart, dayEnd)).length,
      studyMinutes: study.filter((s) => withinWindow(s.created_at, dayStart, dayEnd)).reduce((s, x) => s + (num(x.duration_minutes) || 0), 0),
      messages: messages.filter((m) => withinWindow(m.created_at, dayStart, dayEnd)).length,
    };
    const hasActivity = counts.tasksCreated + counts.tasksCompleted + counts.studyMinutes + counts.messages > 0;
    const dayWorkload = hasActivity ? workloadDayScore(counts) : null;
    const dayStress = stressByDay.get(key) ?? null;
    const { score: dayWellbeing } = computeWellbeing(dayStress, dayWorkload, dayMoodScore);
    activityByDay.set(key, counts.tasksCreated + counts.tasksCompleted + counts.studyMinutes + counts.messages);
    series.push({ date: key, stress: dayStress, workload: dayWorkload, mood: dayMoodScore, wellbeing: dayWellbeing });
  }

  const stressVals = series.map((d) => d.stress);
  const workloadVals = series.map((d) => d.workload);
  const moodVals = series.map((d) => d.mood);
  const trends = {
    stress: computeTrend(stressVals),
    workload: computeTrend(workloadVals),
    mood: computeTrend(moodVals),
  };

  // Busiest hours in the user's timezone from activity timestamps in the window.
  const timeZone = resolveTimeZone(input.timeZone);
  const hourCounts = new Map<number, number>();
  const eventTimes: string[] = [
    ...tasks.map((t) => t.created_at),
    ...study.map((s) => s.created_at),
    ...messages.map((m) => m.created_at),
  ].filter((t): t is string => !!t);
  for (const t of eventTimes) {
    const ms = Date.parse(t);
    if (!Number.isFinite(ms) || ms < windowStart || ms > nowMs + DAY_MS) continue;
    const h = hourInZone(ms, timeZone);
    hourCounts.set(h, (hourCounts.get(h) || 0) + 1);
  }
  const busiestHours: BusiestHour[] = [...hourCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .slice(0, 3)
    .map(([hour, count]) => ({ hour, label: hourLabel(hour), count }));

  // Weekday load: mean of each day's known stress/workload, averaged per weekday.
  const weekdayLoad: number[][] = Array.from({ length: 7 }, () => []);
  const weekdayEvents = new Array<number>(7).fill(0);
  for (const d of series) {
    const wd = new Date(`${d.date}T12:00:00.000Z`).getUTCDay();
    const known = [d.stress, d.workload].filter((v): v is number => v !== null);
    if (known.length) weekdayLoad[wd].push(known.reduce((a, b) => a + b, 0) / known.length);
    weekdayEvents[wd] += activityByDay.get(d.date) || 0;
  }
  const weekdayAvg = weekdayLoad.map((vals) => (vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null));
  let hardestWeekday: string | null = null;
  let hardestWeekdayLoad: number | null = null;
  let calmestWeekday: string | null = null;
  let calmestWeekdayLoad: number | null = null;
  for (let wd = 0; wd < 7; wd++) {
    const avg = weekdayAvg[wd];
    if (avg === null) continue;
    if (hardestWeekdayLoad === null || avg > hardestWeekdayLoad) {
      hardestWeekday = WEEKDAY_NAMES[wd];
      hardestWeekdayLoad = round1(avg);
    }
    if (calmestWeekdayLoad === null || avg < calmestWeekdayLoad) {
      calmestWeekday = WEEKDAY_NAMES[wd];
      calmestWeekdayLoad = round1(avg);
    }
  }
  let mostActiveWeekday: string | null = null;
  let mostActiveWeekdayCount = 0;
  for (let wd = 0; wd < 7; wd++) {
    if (weekdayEvents[wd] > mostActiveWeekdayCount) {
      mostActiveWeekday = WEEKDAY_NAMES[wd];
      mostActiveWeekdayCount = weekdayEvents[wd];
    }
  }

  // Wellbeing: today + 7-day average + recovery fact.
  const todayEntry = series[series.length - 1];
  const { components: todayComponents } = computeWellbeing(todayEntry.stress, todayEntry.workload, todayEntry.mood);
  const last7 = series.slice(-7);
  const wellbeing7 = last7.map((d) => d.wellbeing).filter((v): v is number => v !== null);
  const isLowActivity = (d: PatternDay) => d.workload !== null && d.workload < 30;
  const lowActivityDays = last7.filter(isLowActivity).length;
  let lowActivityStreak = 0;
  for (let i = last7.length - 1; i >= 0; i--) {
    if (isLowActivity(last7[i])) lowActivityStreak++;
    else break;
  }

  // Today's open tasks due today, for the briefing.
  const todayTasks = tasks
    .filter((t) => (t.status || "") !== "done" && t.due_date && t.due_date.slice(0, 10) === today)
    .map((t) => ({ title: (t as { title?: string }).title || "Task" }));

  const hasData =
    series.some((d) => d.stress !== null || d.workload !== null || d.mood !== null || d.wellbeing !== null) ||
    tasks.length > 0;

  // Alerts — each only when the data supports it.
  const alerts: PatternAlert[] = [];
  if (trends.stress.direction === "rising" && trends.stress.streak >= 3) {
    alerts.push({
      key: "stress-rising",
      kind: "warning",
      text: `Your stress estimate has risen ${trends.stress.streak} days in a row — consider a lighter day and a real break before it builds further.`,
    });
  }
  if (trends.workload.delta !== null && trends.workload.delta > 15) {
    alerts.push({
      key: "workload-up",
      kind: "warning",
      text: `Your workload is up ${trends.workload.delta} points on last week. Spreading the busiest days out may help.`,
    });
  }
  const todayName = WEEKDAY_NAMES[new Date(`${today}T12:00:00.000Z`).getUTCDay()];
  if (hardestWeekday === todayName && hardestWeekdayLoad !== null) {
    alerts.push({
      key: "hardest-weekday",
      kind: "info",
      text: `Today is ${todayName} — historically your hardest day of the week (average load ${hardestWeekdayLoad}/100). Plan the tough stuff early.`,
    });
  }
  const weekStart = nowMs - 7 * DAY_MS;
  const moodInWeek = mood.some((m) => withinWindow(m.created_at, weekStart, nowMs + DAY_MS));
  if (hasData && !moodInWeek) {
    alerts.push({
      key: "no-mood-checkin",
      kind: "info",
      text: "No mood check-in in the last 7 days — a quick check-in keeps your picture honest.",
    });
  }
  if (hasData && lowActivityStreak >= 3) {
    alerts.push({
      key: "rest-streak",
      kind: "positive",
      text: `${lowActivityStreak} quiet days in a row — that looks like real rest, not falling behind. Well done.`,
    });
  }

  const result: PatternResult = {
    today: todayEntry,
    series,
    trends,
    patterns: {
      busiestHours,
      timeZone,
      hardestWeekday,
      hardestWeekdayLoad,
      calmestWeekday,
      calmestWeekdayLoad,
      mostActiveWeekday,
      mostActiveWeekdayCount,
    },
    wellbeing: {
      today: todayEntry.wellbeing,
      average7: mean(wellbeing7),
      components: todayComponents,
      lowActivityDays,
      lowActivityStreak,
    },
    todayTasks,
    alerts,
    briefing: "",
    hasData,
    disclaimer: PATTERNS_DISCLAIMER,
  };
  result.briefing = templateBriefing(result);
  return result;
}
