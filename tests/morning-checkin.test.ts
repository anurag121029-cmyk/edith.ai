import { describe, it, expect } from "vitest";
import {
  SLEEP_CHIPS,
  sleepHoursForChip,
  stressFromMood,
  validateMorningCheckin,
  morningCheckinRecord,
  todaysCheckin,
  type CheckinLike,
} from "../lib/morningCheckin";

describe("sleep chips", () => {
  it("offers five ranges with a representative hour value each", () => {
    expect(SLEEP_CHIPS.map((c) => [c.id, c.label, c.hours])).toEqual([
      ["under-5", "Under 5", 4.5],
      ["5-6", "5–6", 5.5],
      ["6-7", "6–7", 6.5],
      ["7-8", "7–8", 7.5],
      ["over-8", "Over 8", 8.5],
    ]);
  });

  it("maps each chip id to its hours and returns null for an unknown id", () => {
    expect(sleepHoursForChip("under-5")).toBe(4.5);
    expect(sleepHoursForChip("5-6")).toBe(5.5);
    expect(sleepHoursForChip("6-7")).toBe(6.5);
    expect(sleepHoursForChip("7-8")).toBe(7.5);
    expect(sleepHoursForChip("over-8")).toBe(8.5);
    expect(sleepHoursForChip("nope")).toBeNull();
  });
});

describe("stressFromMood — derived, not measured", () => {
  it("mirrors mood: mood 10 → stress 1, mood 1 → stress 10", () => {
    expect(stressFromMood(10)).toBe(1);
    expect(stressFromMood(7)).toBe(4);
    expect(stressFromMood(5)).toBe(6);
    expect(stressFromMood(1)).toBe(10);
  });

  it("clamps out-of-range mood instead of producing an invalid stress score", () => {
    expect(stressFromMood(0)).toBe(10);
    expect(stressFromMood(11)).toBe(1);
  });
});

describe("validateMorningCheckin", () => {
  it("accepts a valid mood with sleep, and a valid mood with no sleep yet", () => {
    expect(validateMorningCheckin(7, 6.5)).toEqual([]);
    expect(validateMorningCheckin(1, null)).toEqual([]);
    expect(validateMorningCheckin(10, 0)).toEqual([]);
    expect(validateMorningCheckin(10, 24)).toEqual([]);
  });

  it("rejects mood outside 1–10 or not a whole number", () => {
    expect(validateMorningCheckin(0, 6.5).join(" ")).toContain("Mood must be");
    expect(validateMorningCheckin(11, 6.5).join(" ")).toContain("Mood must be");
    expect(validateMorningCheckin(7.5, 6.5).join(" ")).toContain("Mood must be");
    expect(validateMorningCheckin("7", 6.5).join(" ")).toContain("Mood must be");
  });

  it("rejects sleep outside 0–24 or not a number", () => {
    expect(validateMorningCheckin(7, -1).join(" ")).toContain("Sleep hours must be");
    expect(validateMorningCheckin(7, 25).join(" ")).toContain("Sleep hours must be");
    expect(validateMorningCheckin(7, NaN).join(" ")).toContain("Sleep hours must be");
    expect(validateMorningCheckin(7, "6.5").join(" ")).toContain("Sleep hours must be");
  });
});

describe("morningCheckinRecord — the saved shape", () => {
  it("stores mood, derived stress, sleep and a null note", () => {
    expect(morningCheckinRecord(7, 6.5)).toEqual({
      mood_score: 7,
      stress_score: 4,
      sleep_hours: 6.5,
      note: null,
    });
  });

  it("keeps sleep null when it was not answered", () => {
    expect(morningCheckinRecord(3, null)).toEqual({
      mood_score: 3,
      stress_score: 8,
      sleep_hours: null,
      note: null,
    });
  });
});

describe("todaysCheckin", () => {
  const now = new Date();
  const todayIso = now.toISOString();
  const yesterdayIso = new Date(now.getTime() - 25 * 60 * 60 * 1000).toISOString();
  const rows: CheckinLike[] = [
    { mood_score: 5, stress_score: 6, sleep_hours: null, created_at: yesterdayIso },
    { mood_score: 7, stress_score: 4, sleep_hours: 6.5, created_at: todayIso },
  ];

  it("returns today's latest check-in, not yesterday's", () => {
    expect(todaysCheckin(rows)?.mood_score).toBe(7);
    expect(todaysCheckin(rows)?.sleep_hours).toBe(6.5);
  });

  it("returns null when there is no check-in today", () => {
    expect(todaysCheckin([rows[0]])).toBeNull();
    expect(todaysCheckin([])).toBeNull();
  });
});
