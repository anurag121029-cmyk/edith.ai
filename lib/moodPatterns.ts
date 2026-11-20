/**
 * Mood patterns — what EDITH learns from the user's own mood check-ins.
 *
 * Pure and deterministic, over the last 28 days. The daily series and
 * the mood trend are REUSED from lib/patterns.ts `computePatterns`
 * (same daily mood values, same trend formula — never duplicated
 * here); this module adds the mood-specific reading on top: average
 * mood, best/worst weekday, stability, check-in consistency and
 * streak, and the mood × workload correlation.
 *
 * Two day conventions, documented so they are not confused:
 * - The engine (trend, weekday, correlation) uses UTC day keys, the
 *   same convention as lib/patterns.ts and lib/stress.ts.
 * - The calendar helpers (`localDayKey`, `averageMoodByDay`,
 *   `checkinStreakLocal`) use LOCAL wall-clock dates, because a
 *   calendar must show the day the user experienced.
 *
 * Everything here is an ESTIMATE from the user's own self-reported
 * check-ins and app activity. It is explicitly NOT a medical
 * diagnosis or clinical assessment — every surface that shows it
 * must say so.
 */
import {
  computePatterns,
  PATTERNS_DISCLAIMER,
  WEEKDAY_NAMES,
  type MetricTrend,
  type PatternInputs,
} from "./patterns";

export const MOOD_PATTERNS_DISCLAIMER = PATTERNS_DISCLAIMER;

export interface MoodCheckin {
  mood_score?: number | null;
  stress_score?: number | null;
  created_at?: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const num = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;
function mean(vals: number[]): number | null {
  return vals.length ? round1(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
}
function stddev(vals: number[]): number | null {
  if (vals.length < 2) return null;
  const m = vals.reduce((a, b) => a + b, 0) / vals.length;
  const v = vals.reduce((s, x) => s + (x - m) * (x - m), 0) / vals.length;
  return round1(Math.sqrt(v));
}

/** Local wall-clock date key "YYYY-MM-DD" for a Date. */
export function localDayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Average mood per LOCAL day (1–10, 1 decimal), keyed by local date.
 * Used by the mood history calendar. Days with no check-in are absent
 * (never invented).
 */
export function averageMoodByDay(checkins: MoodCheckin[]): Map<string, number> {
  const sums = new Map<string, { total: number; count: number }>();
  for (const c of checkins) {
    if (c.mood_score === null || c.mood_score === undefined) continue;
    const score = num(c.mood_score);
    if (score === null || !c.created_at) continue;
    const t = Date.parse(c.created_at);
    if (!Number.isFinite(t)) continue;
    const key = localDayKey(new Date(t));
    const cur = sums.get(key) || { total: 0, count: 0 };
    cur.total += score;
    cur.count += 1;
    sums.set(key, cur);
  }
  const out = new Map<string, number>();
  for (const [key, { total, count }] of sums) out.set(key, round1(total / count));
  return out;
}

/**
 * Today's check-in status and streak, on LOCAL dates (what the user
 * sees on the calendar). The streak counts consecutive days with at
 * least one check-in; if today has none yet, it counts back from
 * yesterday, so a run is not lost before the first check-in of the
 * day. It is 0 when neither today nor yesterday has a check-in.
 */
export function checkinStreakLocal(
  checkins: MoodCheckin[],
  now: Date = new Date(),
): { checkedInToday: boolean; streak: number } {
  const days = new Set<string>();
  for (const c of checkins) {
    if (!c.created_at) continue;
    const t = Date.parse(c.created_at);
    if (Number.isFinite(t)) days.add(localDayKey(new Date(t)));
  }
  const todayKey = localDayKey(now);
  const checkedInToday = days.has(todayKey);
  let streak = 0;
  const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (!checkedInToday) cursor.setDate(cursor.getDate() - 1);
  while (days.has(localDayKey(cursor)) && streak < 365) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return { checkedInToday, streak };
}

/**
 * Pearson correlation coefficient between two equal-length series.
 * Returns null when there are fewer than 2 points or either series
 * has zero variance (no correlation to measure). Rounded to 2 decimals.
 */
export function pearsonCorrelation(xs: number[], ys: number[]): number | null {
  if (xs.length !== ys.length || xs.length < 2) return null;
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  if (sxx === 0 || syy === 0) return null;
  return round2(sxy / Math.sqrt(sxx * syy));
}

export const CORRELATION_CAUSATION_NOTE =
  "Correlation is not causation — a busy day and a low mood happening together does not prove one caused the other.";

export type CorrelationKey = "negative" | "positive" | "none" | "insufficient";

export interface MoodCorrelation {
  /** Pearson r, 2 decimals, or null when fewer than 7 overlapping days exist. */
  r: number | null;
  /** Days where both a mood check-in and workload activity exist. */
  days: number;
  key: CorrelationKey;
  reading: string;
}

/**
 * Plain-language reading of the mood × workload correlation.
 * Thresholds: r <= -0.5 strong negative, r >= 0.5 strong positive,
 * anything in between no clear link. Fewer than 7 overlapping days
 * is reported as insufficient, with no r value shown.
 */
export function correlationReading(r: number | null, days: number): MoodCorrelation {
  if (days < 7 || r === null) {
    return {
      r: null,
      days,
      key: "insufficient",
      reading:
        "Not enough overlapping days yet — mood and workload need to be recorded on the same day at least 7 times in the last 28 days before a link can be judged.",
    };
  }
  if (r <= -0.5) {
    return {
      r,
      days,
      key: "negative",
      reading: `On busier days your mood tends to drop (r = ${r}). ${CORRELATION_CAUSATION_NOTE}`,
    };
  }
  if (r >= 0.5) {
    return {
      r,
      days,
      key: "positive",
      reading: `Busier days tend to come with a better mood for you (r = ${r}). ${CORRELATION_CAUSATION_NOTE}`,
    };
  }
  return {
    r,
    days,
    key: "none",
    reading: `No clear link between workload and mood in the last 28 days (r = ${r}). ${CORRELATION_CAUSATION_NOTE}`,
  };
}

export interface MoodDay {
  date: string;
  /** Average mood that day, 1–10, or null when no check-in. */
  mood: number | null;
  /** Daily workload score 0–100, or null when no activity that day. */
  workload: number | null;
}

export interface MoodPatternsResult {
  /** Average mood 1–10 (1 decimal), null when no check-ins in 28 days. */
  averageMood: number | null;
  /** Total check-ins in the 28-day window. */
  checkins28: number;
  /** Days with at least one check-in, out of 28. */
  daysCheckedIn: number;
  /** daysCheckedIn / 28 (0–1, 2 decimals). */
  consistency: number;
  /** A check-in exists for today (UTC day, engine convention). */
  checkedInToday: boolean;
  /** Consecutive days with a check-in ending today (0 when none today). */
  checkinStreak: number;
  /** Mood trend reused from lib/patterns.ts (0–100 scale values). */
  trend: MetricTrend;
  bestWeekday: string | null;
  bestWeekdayMood: number | null;
  worstWeekday: string | null;
  worstWeekdayMood: number | null;
  mostStableWeekday: string | null;
  mostStableWeekdayStd: number | null;
  leastStableWeekday: string | null;
  leastStableWeekdayStd: number | null;
  /** Stddev of daily mood 1–10 (1 decimal), null with fewer than 2 days. */
  volatility: number | null;
  /** Min/max daily average mood 1–10. */
  moodRange: { min: number | null; max: number | null };
  correlation: MoodCorrelation;
  /** 28 daily entries, oldest first; mood 1–10, workload 0–100. */
  series: MoodDay[];
  /** True when at least one check-in exists in the window. */
  hasData: boolean;
  disclaimer: string;
}

export function computeMoodPatterns(input: PatternInputs): MoodPatternsResult {
  const nowMs = (input.now ? new Date(input.now) : new Date()).getTime();
  const windowStart = nowMs - 28 * DAY_MS;

  // Daily series + mood trend come from the patterns engine — same
  // values, same formulas, no duplication.
  const p = computePatterns(input);
  const series: MoodDay[] = p.series.map((d) => ({
    date: d.date,
    mood: d.mood === null ? null : round1(d.mood / 10),
    workload: d.workload,
  }));

  const inWindow = (createdAt?: string) => {
    if (!createdAt) return false;
    const t = Date.parse(createdAt);
    return Number.isFinite(t) && t >= windowStart && t <= nowMs + DAY_MS;
  };
  const checkins = (input.mood || []).filter((m) => inWindow(m.created_at));
  const checkins28 = checkins.length;
  const moodVals = series.map((d) => d.mood).filter((v): v is number => v !== null);
  const averageMood = mean(moodVals);
  const daysCheckedIn = moodVals.length;
  const consistency = round2(daysCheckedIn / 28);

  const todayEntry = series[series.length - 1];
  const checkedInToday = todayEntry.mood !== null;
  let checkinStreak = 0;
  for (let i = series.length - 1; i >= 0; i--) {
    if (series[i].mood !== null) checkinStreak++;
    else break;
  }

  // Mood by weekday (UTC day, engine convention) and stability.
  const byWeekday: number[][] = Array.from({ length: 7 }, () => []);
  for (const d of series) {
    if (d.mood === null) continue;
    const wd = new Date(`${d.date}T12:00:00.000Z`).getUTCDay();
    byWeekday[wd].push(d.mood);
  }
  const weekdayAvg = byWeekday.map((vals) => mean(vals));
  const weekdayStd = byWeekday.map((vals) => stddev(vals));
  let bestWeekday: string | null = null;
  let bestWeekdayMood: number | null = null;
  let worstWeekday: string | null = null;
  let worstWeekdayMood: number | null = null;
  let mostStableWeekday: string | null = null;
  let mostStableWeekdayStd: number | null = null;
  let leastStableWeekday: string | null = null;
  let leastStableWeekdayStd: number | null = null;
  for (let wd = 0; wd < 7; wd++) {
    const avg = weekdayAvg[wd];
    if (avg !== null) {
      if (bestWeekdayMood === null || avg > bestWeekdayMood) {
        bestWeekday = WEEKDAY_NAMES[wd];
        bestWeekdayMood = avg;
      }
      if (worstWeekdayMood === null || avg < worstWeekdayMood) {
        worstWeekday = WEEKDAY_NAMES[wd];
        worstWeekdayMood = avg;
      }
    }
    const sd = weekdayStd[wd];
    if (sd !== null) {
      if (mostStableWeekdayStd === null || sd < mostStableWeekdayStd) {
        mostStableWeekday = WEEKDAY_NAMES[wd];
        mostStableWeekdayStd = sd;
      }
      if (leastStableWeekdayStd === null || sd > leastStableWeekdayStd) {
        leastStableWeekday = WEEKDAY_NAMES[wd];
        leastStableWeekdayStd = sd;
      }
    }
  }

  const volatility = stddev(moodVals);
  const moodRange = {
    min: moodVals.length ? Math.min(...moodVals) : null,
    max: moodVals.length ? Math.max(...moodVals) : null,
  };

  // Mood × workload: Pearson r over days where BOTH exist.
  const pairs = series.filter(
    (d): d is { date: string; mood: number; workload: number } =>
      d.mood !== null && d.workload !== null,
  );
  const r =
    pairs.length >= 2
      ? pearsonCorrelation(
          pairs.map((d) => d.workload),
          pairs.map((d) => d.mood),
        )
      : null;
  const correlation = correlationReading(r, pairs.length);

  return {
    averageMood,
    checkins28,
    daysCheckedIn,
    consistency,
    checkedInToday,
    checkinStreak,
    trend: p.trends.mood,
    bestWeekday,
    bestWeekdayMood,
    worstWeekday,
    worstWeekdayMood,
    mostStableWeekday,
    mostStableWeekdayStd,
    leastStableWeekday,
    leastStableWeekdayStd,
    volatility,
    moodRange,
    correlation,
    series,
    hasData: checkins28 > 0,
    disclaimer: MOOD_PATTERNS_DISCLAIMER,
  };
}

/** Deterministic template mood summary from the aggregates. No AI needed. */
export function templateMoodSummary(r: MoodPatternsResult): string {
  if (!r.hasData || r.averageMood === null) {
    return "Not enough mood data yet — add a few daily check-ins and EDITH will start summarising how your mood has been trending.";
  }
  const parts: string[] = [];
  parts.push(`Your average mood over the last 28 days is ${r.averageMood}/10, from ${r.checkins28} check-in${r.checkins28 === 1 ? "" : "s"} on ${r.daysCheckedIn} of the last 28 days.`);
  if (r.trend.direction === "rising") {
    parts.push(`Your mood has been rising lately (${r.trend.delta !== null ? `${(Math.abs(r.trend.delta) / 10).toFixed(1)} points on the 1–10 scale` : "up"} on last week).`);
  } else if (r.trend.direction === "falling") {
    parts.push(`Your mood has been dipping lately (${r.trend.delta !== null ? `${(Math.abs(r.trend.delta) / 10).toFixed(1)} points on the 1–10 scale` : "down"} on last week) — a lighter day and a real break may help.`);
  } else {
    parts.push("Your mood has been fairly steady compared with last week.");
  }
  if (r.bestWeekday && r.bestWeekdayMood !== null && r.worstWeekday && r.worstWeekdayMood !== null) {
    parts.push(`${r.bestWeekday}s are usually your best day (average mood ${r.bestWeekdayMood}/10), and ${r.worstWeekday}s your hardest (average mood ${r.worstWeekdayMood}/10).`);
  }
  if (r.checkinStreak >= 2) {
    parts.push(`You have checked in ${r.checkinStreak} days in a row — keeping that habit makes the picture more honest.`);
  }
  if (r.correlation.key !== "insufficient") {
    parts.push(r.correlation.reading);
  } else {
    parts.push(r.correlation.reading);
  }
  return parts.join(" ");
}
