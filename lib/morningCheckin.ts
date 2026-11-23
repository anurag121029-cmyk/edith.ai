/**
 * Morning check-in — two taps, about ten seconds.
 *
 * Tap 1: how is your mood right now, 1–10.
 * Tap 2: how long did you sleep last night, as one of five quick chips.
 * The second tap saves automatically to mood_checkins.
 *
 * Honest limits, stated in code so the UI cannot forget them:
 * - Sleep is a RANGE the user picks, not a measured value. It is stored
 *   as the representative hours for that range: the middle of the range,
 *   and for the two open-ended ranges the nearest half-hour inside the
 *   range (4.5 for "under 5", 8.5 for "over 8"). It is an estimate.
 * - Stress is NOT measured in the morning check-in. mood_checkins has
 *   stress_score NOT NULL (1–10), so the stored stress is DERIVED from
 *   mood as 11 − mood — the same mirror convention lib/moodAuto.ts
 *   uses (moodScore = 11 − stressScore). The UI must say the stress
 *   here is estimated from mood, and point at the full check-in on the
 *   Mood page for setting stress directly.
 * - Nothing here is sent to Gemini. The journal stays private.
 * - These are self-reported estimates, not a diagnosis.
 */

import { localDayKey } from "./moodPatterns";

export interface SleepChip {
  id: string;
  label: string;
  /** Representative hours stored for this range (see header). */
  hours: number;
}

export const SLEEP_CHIPS: SleepChip[] = [
  { id: "under-5", label: "Under 5", hours: 4.5 },
  { id: "5-6", label: "5–6", hours: 5.5 },
  { id: "6-7", label: "6–7", hours: 6.5 },
  { id: "7-8", label: "7–8", hours: 7.5 },
  { id: "over-8", label: "Over 8", hours: 8.5 },
];

/** Hours stored for a sleep chip id, or null for an unknown id. */
export function sleepHoursForChip(chipId: string): number | null {
  return SLEEP_CHIPS.find((c) => c.id === chipId)?.hours ?? null;
}

/**
 * Stress stored alongside a morning check-in. Derived from mood as
 * 11 − mood (mood 10 → stress 1, mood 1 → stress 10) because the
 * table requires a stress_score and the morning check-in does not ask
 * for one. DERIVED, not measured — the UI says so.
 */
export function stressFromMood(mood: number): number {
  const m = Math.min(10, Math.max(1, Math.round(mood)));
  return 11 - m;
}

/**
 * Validate a morning check-in. Returns a list of problems (empty when
 * valid): mood an integer 1–10; sleep null (not answered) or a number
 * 0–24. A sleep value outside 0–24 is never stored.
 */
export function validateMorningCheckin(mood: unknown, sleepHours: unknown): string[] {
  const errors: string[] = [];
  if (typeof mood !== "number" || !Number.isInteger(mood) || mood < 1 || mood > 10) {
    errors.push(`Mood must be a whole number from 1 to 10, got: ${String(mood)}.`);
  }
  if (sleepHours !== null && sleepHours !== undefined) {
    if (typeof sleepHours !== "number" || !Number.isFinite(sleepHours) || sleepHours < 0 || sleepHours > 24) {
      errors.push(`Sleep hours must be a number from 0 to 24, got: ${String(sleepHours)}.`);
    }
  }
  return errors;
}

export interface MorningCheckinRow {
  mood_score: number;
  stress_score: number;
  sleep_hours: number | null;
  note: null;
}

/** Insert payload for a morning check-in (see migration 0008). */
export function morningCheckinRecord(mood: number, sleepHours: number | null): MorningCheckinRow {
  return {
    mood_score: Math.min(10, Math.max(1, Math.round(mood))),
    // Derived from mood — see stressFromMood. Not a measured stress score.
    stress_score: stressFromMood(mood),
    sleep_hours: sleepHours === null || sleepHours === undefined ? null : Math.round(sleepHours * 10) / 10,
    note: null,
  };
}

export interface CheckinLike {
  mood_score: number;
  stress_score: number;
  sleep_hours?: number | null;
  created_at: string;
}

/** The user's latest check-in from today (local wall-clock day), or null. */
export function todaysCheckin(rows: CheckinLike[]): CheckinLike | null {
  const today = localDayKey(new Date());
  const todays = rows.filter((r) => localDayKey(new Date(r.created_at)) === today);
  if (!todays.length) return null;
  return todays.reduce((latest, r) => (new Date(r.created_at).getTime() > new Date(latest.created_at).getTime() ? r : latest));
}
