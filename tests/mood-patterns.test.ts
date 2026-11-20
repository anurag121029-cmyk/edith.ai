import { describe, it, expect } from "vitest";
import {
  computeMoodPatterns,
  averageMoodByDay,
  checkinStreakLocal,
  localDayKey,
  pearsonCorrelation,
  correlationReading,
  templateMoodSummary,
} from "../lib/moodPatterns";
import type { PatternInputs } from "../lib/patterns";

const NOW = new Date("2026-11-10T12:00:00.000Z"); // a Tuesday
const day = (iso: string) => `${iso}T10:00:00.000Z`;
const noon = (iso: string) => `${iso}T12:00:00.000Z`;
function base(over: Partial<PatternInputs> = {}): PatternInputs {
  return { tasks: [], study: [], messages: [], mood: [], workload: [], now: NOW, ...over };
}
const checkin = (iso: string, mood: number, stress = 5) => ({ mood_score: mood, stress_score: stress, created_at: day(iso) });
const msgs = (iso: string, n: number) =>
  Array.from({ length: n }, (_, i) => ({ content: `m${i}`, created_at: day(iso) }));

describe("localDayKey / averageMoodByDay (calendar)", () => {
  it("formats a local date key", () => {
    expect(localDayKey(new Date("2026-11-10T12:00:00.000Z"))).toBe("2026-11-10");
  });

  it("averages several check-ins on the same day and skips empty days", () => {
    const byDay = averageMoodByDay([
      { mood_score: 6, created_at: noon("2026-11-09") },
      { mood_score: 8, created_at: noon("2026-11-09") },
      { mood_score: 4, created_at: noon("2026-11-08") },
      { mood_score: null, created_at: noon("2026-11-07") },
    ]);
    expect(byDay.get("2026-11-09")).toBe(7);
    expect(byDay.get("2026-11-08")).toBe(4);
    expect(byDay.has("2026-11-07")).toBe(false);
    expect(byDay.has("2026-11-10")).toBe(false);
  });
});

describe("checkinStreakLocal", () => {
  it("counts consecutive days ending today", () => {
    const r = checkinStreakLocal(
      [checkin("2026-11-08", 7), checkin("2026-11-09", 7), checkin("2026-11-10", 7)],
      NOW,
    );
    expect(r).toEqual({ checkedInToday: true, streak: 3 });
  });

  it("counts back from yesterday when today has no check-in yet", () => {
    const r = checkinStreakLocal([checkin("2026-11-08", 7), checkin("2026-11-09", 7)], NOW);
    expect(r).toEqual({ checkedInToday: false, streak: 2 });
  });

  it("stops at a gap and returns 0 with nothing recent", () => {
    expect(checkinStreakLocal([checkin("2026-11-10", 7), checkin("2026-11-08", 7)], NOW)).toEqual({
      checkedInToday: true,
      streak: 1,
    });
    expect(checkinStreakLocal([], NOW)).toEqual({ checkedInToday: false, streak: 0 });
  });
});

describe("computeMoodPatterns — no data", () => {
  it("returns an honest no-data state", () => {
    const r = computeMoodPatterns(base());
    expect(r.averageMood).toBeNull();
    expect(r.checkins28).toBe(0);
    expect(r.daysCheckedIn).toBe(0);
    expect(r.consistency).toBe(0);
    expect(r.checkedInToday).toBe(false);
    expect(r.checkinStreak).toBe(0);
    expect(r.hasData).toBe(false);
    expect(r.series).toHaveLength(28);
    expect(r.correlation).toEqual({
      r: null,
      days: 0,
      key: "insufficient",
      reading: expect.stringContaining("Not enough overlapping days"),
    });
    expect(r.bestWeekday).toBeNull();
    expect(r.worstWeekday).toBeNull();
    expect(templateMoodSummary(r)).toContain("Not enough mood data");
  });
});

describe("computeMoodPatterns — average, consistency, trend", () => {
  it("averages mood, counts days and detects a rising trend with streak", () => {
    // Previous week mood 4 every day; this week strictly rising 4..10.
    const prevWeek = ["2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02", "2026-11-03"].map((d) => checkin(d, 4));
    const thisWeek = ["2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08", "2026-11-09", "2026-11-10"].map((d, i) => checkin(d, 4 + i));
    const r = computeMoodPatterns(base({ mood: [...prevWeek, ...thisWeek] }));
    expect(r.averageMood).toBe(5.5);
    expect(r.checkins28).toBe(14);
    expect(r.daysCheckedIn).toBe(14);
    expect(r.consistency).toBe(0.5);
    expect(r.checkedInToday).toBe(true);
    expect(r.checkinStreak).toBe(14);
    expect(r.trend.direction).toBe("rising");
    expect(r.trend.delta).toBe(30);
    expect(r.trend.streak).toBe(6);
    expect(r.hasData).toBe(true);
  });

  it("stays flat when the weeks match", () => {
    const mood = ["2026-10-28", "2026-10-29", "2026-11-04", "2026-11-05"].map((d) => checkin(d, 6));
    const r = computeMoodPatterns(base({ mood }));
    expect(r.trend.direction).toBe("flat");
    expect(r.trend.delta).toBe(0);
  });
});

describe("computeMoodPatterns — weekdays and stability", () => {
  it("finds the best and worst weekday", () => {
    const mood = [
      // Mondays 9, Fridays 3, Wednesdays 6 (mid).
      ...["2026-10-19", "2026-10-26", "2026-11-02", "2026-11-09"].map((d) => checkin(d, 9)),
      ...["2026-10-16", "2026-10-23", "2026-10-30", "2026-11-06"].map((d) => checkin(d, 3)),
      ...["2026-10-21", "2026-10-28", "2026-11-04"].map((d) => checkin(d, 6)),
    ];
    const r = computeMoodPatterns(base({ mood }));
    expect(r.bestWeekday).toBe("Monday");
    expect(r.bestWeekdayMood).toBe(9);
    expect(r.worstWeekday).toBe("Friday");
    expect(r.worstWeekdayMood).toBe(3);
  });

  it("finds the most and least stable weekday and the overall range", () => {
    const mood = [
      ...["2026-10-19", "2026-10-26", "2026-11-02", "2026-11-09"].map((d) => checkin(d, 8)),
      ...["2026-10-20", "2026-10-27", "2026-11-03", "2026-11-10"].map((d, i) => checkin(d, i % 2 === 0 ? 5 : 9)),
      ...["2026-10-21", "2026-10-28", "2026-11-04"].map((d) => checkin(d, 7)),
    ];
    const r = computeMoodPatterns(base({ mood }));
    expect(r.mostStableWeekday).toBe("Monday");
    expect(r.mostStableWeekdayStd).toBe(0);
    expect(r.leastStableWeekday).toBe("Tuesday");
    expect(r.leastStableWeekdayStd).toBe(2);
    expect(r.moodRange).toEqual({ min: 5, max: 9 });
    expect(r.volatility).not.toBeNull();
    expect(r.volatility).toBeGreaterThan(0);
  });
});

describe("pearsonCorrelation", () => {
  it("returns 1, -1 and null for degenerate series", () => {
    expect(pearsonCorrelation([1, 2, 3], [1, 2, 3])).toBe(1);
    expect(pearsonCorrelation([1, 2, 3], [3, 2, 1])).toBe(-1);
    expect(pearsonCorrelation([7, 7, 7], [1, 2, 3])).toBeNull();
    expect(pearsonCorrelation([1], [1])).toBeNull();
  });
});

describe("computeMoodPatterns — mood × workload correlation", () => {
  // Workload per day from message counts only: n messages -> 5n.
  // 7 days 2026-11-04..11-10 with workload 10,20,30,40,50,60,70.
  const workloadMsgs = [2, 4, 6, 8, 10, 12, 14].flatMap((n, i) =>
    msgs(["2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08", "2026-11-09", "2026-11-10"][i], n),
  );
  const moodFor = (scores: number[]) =>
    scores.map((m, i) => checkin(["2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08", "2026-11-09", "2026-11-10"][i], m));

  it("reports a strong negative correlation when mood falls as workload rises", () => {
    const r = computeMoodPatterns(base({ mood: moodFor([9, 8, 7, 6, 5, 4, 3]), messages: workloadMsgs }));
    expect(r.correlation.r).toBe(-1);
    expect(r.correlation.days).toBe(7);
    expect(r.correlation.key).toBe("negative");
    expect(r.correlation.reading).toContain("tends to drop");
    expect(r.correlation.reading).toContain("Correlation is not causation");
  });

  it("reports a strong positive correlation when mood rises with workload", () => {
    const r = computeMoodPatterns(base({ mood: moodFor([3, 4, 5, 6, 7, 8, 9]), messages: workloadMsgs }));
    expect(r.correlation.r).toBe(1);
    expect(r.correlation.key).toBe("positive");
    expect(r.correlation.reading).toContain("better mood");
  });

  it("reports no clear link when mood does not follow workload", () => {
    const r = computeMoodPatterns(base({ mood: moodFor([7, 6, 7, 6, 7, 6, 7]), messages: workloadMsgs }));
    expect(r.correlation.r).toBe(0);
    expect(r.correlation.key).toBe("none");
    expect(r.correlation.reading).toContain("No clear link");
  });

  it("reports insufficient when fewer than 7 days overlap", () => {
    const r = computeMoodPatterns(
      base({
        mood: moodFor([9, 8, 7, 6, 5]).slice(0, 5),
        messages: workloadMsgs.slice(0, 10), // only 2026-11-04 (2) + 11-05 (4) + part of 11-06
      }),
    );
    expect(r.correlation.days).toBeLessThan(7);
    expect(r.correlation.r).toBeNull();
    expect(r.correlation.key).toBe("insufficient");
    expect(r.correlation.reading).toContain("Not enough overlapping days");
  });

  it("counts only days where both mood and workload exist", () => {
    // 7 mood days, but workload only on 5 of them.
    const r = computeMoodPatterns(
      base({
        mood: moodFor([9, 8, 7, 6, 5, 4, 3]),
        messages: [2, 4, 6, 8, 10].flatMap((n, i) =>
          msgs(["2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08"][i], n),
        ),
      }),
    );
    expect(r.correlation.days).toBe(5);
    expect(r.correlation.key).toBe("insufficient");
  });
});

describe("correlationReading thresholds", () => {
  it("reads the thresholds in plain language", () => {
    expect(correlationReading(-0.6, 10).key).toBe("negative");
    expect(correlationReading(-0.5, 10).key).toBe("negative");
    expect(correlationReading(0.5, 10).key).toBe("positive");
    expect(correlationReading(0.6, 10).key).toBe("positive");
    expect(correlationReading(0.1, 10).key).toBe("none");
    expect(correlationReading(-0.49, 10).key).toBe("none");
    expect(correlationReading(null, 5).key).toBe("insufficient");
    expect(correlationReading(-0.9, 6).key).toBe("insufficient");
  });
});

describe("templateMoodSummary", () => {
  it("mentions the real aggregates", () => {
    const mood = [
      ...["2026-10-19", "2026-10-26", "2026-11-02", "2026-11-09"].map((d) => checkin(d, 9)),
      ...["2026-10-16", "2026-10-23", "2026-10-30", "2026-11-06"].map((d) => checkin(d, 3)),
    ];
    const r = computeMoodPatterns(base({ mood }));
    const s = templateMoodSummary(r);
    expect(s).toContain("6/10");
    expect(s).toContain("Monday");
    expect(s).toContain("Friday");
    expect(s).toContain("Not enough overlapping days");
  });
});
