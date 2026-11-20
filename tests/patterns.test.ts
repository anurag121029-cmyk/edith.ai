import { describe, it, expect } from "vitest";
import { computePatterns, computeWellbeing, templateBriefing, PATTERNS_DISCLAIMER, type PatternInputs } from "../lib/patterns";

const NOW = new Date("2026-11-10T12:00:00.000Z"); // a Tuesday
const day = (iso: string) => `${iso}T10:00:00.000Z`;
const at = (iso: string, hour: number) => `${iso}T${String(hour).padStart(2, "0")}:00:00.000Z`;
function base(over: Partial<PatternInputs> = {}): PatternInputs {
  return { tasks: [], study: [], messages: [], mood: [], workload: [], now: NOW, ...over };
}
const alertKeys = (r: ReturnType<typeof computePatterns>) => r.alerts.map((a) => a.key);

describe("computePatterns — no data", () => {
  it("returns an honest no-data state with every day null", () => {
    const r = computePatterns(base());
    expect(r.series).toHaveLength(28);
    expect(r.series[0].date).toBe("2026-10-14");
    expect(r.series[27].date).toBe("2026-11-10");
    for (const d of r.series) {
      expect(d.stress).toBeNull();
      expect(d.workload).toBeNull();
      expect(d.mood).toBeNull();
      expect(d.wellbeing).toBeNull();
    }
    expect(r.today.wellbeing).toBeNull();
    expect(r.wellbeing.today).toBeNull();
    expect(r.wellbeing.average7).toBeNull();
    expect(r.wellbeing.lowActivityDays).toBe(0);
    expect(r.wellbeing.lowActivityStreak).toBe(0);
    expect(r.hasData).toBe(false);
    expect(r.alerts).toEqual([]);
    expect(r.trends.stress.direction).toBe("flat");
    expect(r.trends.stress.delta).toBeNull();
    expect(r.patterns.hardestWeekday).toBeNull();
    expect(r.patterns.calmestWeekday).toBeNull();
    expect(r.patterns.mostActiveWeekday).toBeNull();
    expect(r.patterns.busiestHours).toEqual([]);
    expect(r.disclaimer).toBe(PATTERNS_DISCLAIMER);
    expect(r.briefing).toContain("No activity yet");
  });
});

describe("computePatterns — daily series", () => {
  it("fills days that have data and leaves a no-data day null", () => {
    const r = computePatterns(base({
      mood: [
        { stress_score: 4, mood_score: 7, created_at: day("2026-11-09") },
        { stress_score: 8, mood_score: 3, created_at: day("2026-11-08") },
      ],
    }));
    const byDate = new Map(r.series.map((d) => [d.date, d]));
    const mon = byDate.get("2026-11-09")!;
    expect(mon.stress).toBe(40);
    expect(mon.mood).toBe(70);
    expect(mon.workload).toBeNull();
    // wellbeing: inverted stress 60 (w40) + mood 70 (w30), renormalised
    expect(mon.wellbeing).toBe(64);
    const sun = byDate.get("2026-11-08")!;
    expect(sun.stress).toBe(80);
    expect(sun.mood).toBe(30);
    expect(sun.wellbeing).toBe(24);
    const sat = byDate.get("2026-11-07")!;
    expect(sat.stress).toBeNull();
    expect(sat.workload).toBeNull();
    expect(sat.mood).toBeNull();
    expect(sat.wellbeing).toBeNull();
  });

  it("scores daily workload from that day's activity only", () => {
    const r = computePatterns(base({
      study: [{ duration_minutes: 120, created_at: day("2026-11-09") }],
      messages: [
        { content: "hello", created_at: day("2026-11-09") },
        { content: "hello again", created_at: day("2026-11-09") },
      ],
    }));
    const byDate = new Map(r.series.map((d) => [d.date, d]));
    // 120 study minutes / 4 = 30, plus 2 messages × 5 = 10 → 40
    expect(byDate.get("2026-11-09")!.workload).toBe(40);
    expect(byDate.get("2026-11-08")!.workload).toBeNull();
  });
});

describe("computeWellbeing", () => {
  it("weights inverted stress 40%, inverted workload 30%, mood 30%", () => {
    // (100−40)×40 + (100−20)×30 + 80×30 = 2400 + 2400 + 2400 → 72
    expect(computeWellbeing(40, 20, 80).score).toBe(72);
    expect(computeWellbeing(100, 100, 10).score).toBe(3);
    expect(computeWellbeing(0, 0, 100).score).toBe(100);
  });

  it("renormalises when an input is missing and returns null with none", () => {
    // mood alone: 80
    expect(computeWellbeing(null, null, 80).score).toBe(80);
    // stress + mood only: (60×40 + 70×30) / 70 = 64
    expect(computeWellbeing(40, null, 70).score).toBe(64);
    expect(computeWellbeing(null, null, null).score).toBeNull();
    const { components } = computeWellbeing(40, null, 70);
    expect(components.find((c) => c.key === "workload")!.missing).toBe(true);
    expect(components.find((c) => c.key === "stress")!.value).toBe(60);
  });
});

describe("computePatterns — trends", () => {
  // Stress rises 1→8 across the last 7 days, mood falls with it;
  // the previous week sits flat at stress 1 / mood 10.
  const rising = base({
    mood: [
      ...["2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02", "2026-11-03"].map((d) => ({ stress_score: 1, mood_score: 10, created_at: day(d) })),
      { stress_score: 2, mood_score: 9, created_at: day("2026-11-04") },
      { stress_score: 3, mood_score: 8, created_at: day("2026-11-05") },
      { stress_score: 4, mood_score: 7, created_at: day("2026-11-06") },
      { stress_score: 5, mood_score: 6, created_at: day("2026-11-07") },
      { stress_score: 6, mood_score: 5, created_at: day("2026-11-08") },
      { stress_score: 7, mood_score: 4, created_at: day("2026-11-09") },
      { stress_score: 8, mood_score: 3, created_at: day("2026-11-10") },
    ],
  });

  it("detects a rising stress trend with delta, streak and volatility", () => {
    const r = computePatterns(rising);
    expect(r.trends.stress.direction).toBe("rising");
    expect(r.trends.stress.delta).toBe(40); // this week avg 50, last week avg 10
    expect(r.trends.stress.streak).toBe(7);
    expect(r.trends.stress.volatility).toBe(20);
    expect(r.trends.stress.thisWeekAvg).toBe(50);
    expect(r.trends.stress.prevWeekAvg).toBe(10);
  });

  it("detects the matching falling mood trend", () => {
    const r = computePatterns(rising);
    expect(r.trends.mood.direction).toBe("falling");
    expect(r.trends.mood.delta).toBe(-40);
  });

  it("stays flat when the weeks match", () => {
    const r = computePatterns(base({
      mood: [
        { stress_score: 5, mood_score: 5, created_at: day("2026-11-03") },
        { stress_score: 5, mood_score: 5, created_at: day("2026-11-09") },
      ],
    }));
    expect(r.trends.stress.direction).toBe("flat");
    expect(r.trends.stress.delta).toBe(0);
    expect(r.trends.stress.streak).toBe(0);
  });
});

describe("computePatterns — busiest hours and weekdays", () => {
  it("finds the top 3 busiest hours (UTC) by activity count", () => {
    const r = computePatterns(base({
      tasks: [{ status: "todo", priority: "medium", due_date: null, created_at: at("2026-11-09", 9) }],
      study: [{ duration_minutes: 30, created_at: at("2026-11-09", 14) }],
      messages: [
        { content: "a", created_at: at("2026-11-09", 9) },
        { content: "b", created_at: at("2026-11-09", 9) },
        { content: "c", created_at: at("2026-11-09", 9) },
        { content: "d", created_at: at("2026-11-08", 14) },
        { content: "e", created_at: at("2026-11-08", 21) },
      ],
    }));
    expect(r.patterns.busiestHours).toEqual([
      { hour: 9, label: "9am", count: 4 },
      { hour: 14, label: "2pm", count: 2 },
      { hour: 21, label: "9pm", count: 1 },
    ]);
    expect(r.patterns.timeZone).toBe("UTC");
  });

  it("shifts busiest hours into the user's timezone (Asia/Kolkata = UTC+5:30)", () => {
    const r = computePatterns(base({
      timeZone: "Asia/Kolkata",
      tasks: [{ status: "todo", priority: "medium", due_date: null, created_at: at("2026-11-09", 9) }],
      messages: [
        { content: "a", created_at: at("2026-11-09", 9) },
        { content: "b", created_at: at("2026-11-09", 9) },
        { content: "c", created_at: at("2026-11-09", 9) },
      ],
    }));
    // 09:00 UTC is 14:30 in Kolkata, so the busy hour is 14 (2pm local).
    expect(r.patterns.busiestHours).toEqual([{ hour: 14, label: "2pm", count: 4 }]);
    expect(r.patterns.timeZone).toBe("Asia/Kolkata");
  });

  it("falls back to UTC for an invalid timezone", () => {
    const r = computePatterns(base({
      timeZone: "Not/AZone",
      messages: [{ content: "a", created_at: at("2026-11-09", 9) }],
    }));
    expect(r.patterns.busiestHours).toEqual([{ hour: 9, label: "9am", count: 1 }]);
    expect(r.patterns.timeZone).toBe("UTC");
  });

  it("finds the hardest, calmest and most active weekday", () => {
    const r = computePatterns(base({
      mood: [
        { stress_score: 9, mood_score: 2, created_at: day("2026-11-03") }, // Tuesday
        { stress_score: 9, mood_score: 2, created_at: day("2026-11-10") }, // Tuesday
        { stress_score: 2, mood_score: 9, created_at: day("2026-11-01") }, // Sunday
        { stress_score: 2, mood_score: 9, created_at: day("2026-11-08") }, // Sunday
      ],
      messages: [
        // Wednesday, busy enough (workload 50) that it is neither hardest nor calmest.
        ...Array.from({ length: 10 }, (_, i) => ({ content: `w${i}`, created_at: day("2026-11-04") })),
      ],
    }));
    expect(r.patterns.hardestWeekday).toBe("Tuesday");
    expect(r.patterns.hardestWeekdayLoad).toBe(90);
    expect(r.patterns.calmestWeekday).toBe("Sunday");
    expect(r.patterns.calmestWeekdayLoad).toBe(20);
    expect(r.patterns.mostActiveWeekday).toBe("Wednesday");
    expect(r.patterns.mostActiveWeekdayCount).toBe(10);
  });
});

describe("computePatterns — alerts", () => {
  const risingMood = (stress: number, d: string) => ({ stress_score: stress, mood_score: 11 - stress, created_at: day(d) });

  it("flags stress rising 3+ days in a row, and only then", () => {
    const rising = computePatterns(base({
      mood: [
        risingMood(1, "2026-11-03"), risingMood(2, "2026-11-04"), risingMood(3, "2026-11-05"),
        risingMood(4, "2026-11-06"), risingMood(5, "2026-11-07"), risingMood(6, "2026-11-08"),
        risingMood(7, "2026-11-09"), risingMood(8, "2026-11-10"),
      ],
    }));
    expect(alertKeys(rising)).toContain("stress-rising");
    const flat = computePatterns(base({
      mood: [risingMood(5, "2026-11-03"), risingMood(5, "2026-11-09")],
    }));
    expect(alertKeys(flat)).not.toContain("stress-rising");
  });

  it("flags a workload jump of more than 15 points vs last week, and only then", () => {
    const jump = computePatterns(base({
      messages: [
        { content: "x", created_at: day("2026-11-03") },
        ...["2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08", "2026-11-09", "2026-11-10"].flatMap((d) =>
          Array.from({ length: 6 }, (_, i) => ({ content: `m${d}${i}`, created_at: day(d) }))),
      ],
    }));
    expect(jump.trends.workload.delta).toBeGreaterThan(15);
    expect(alertKeys(jump)).toContain("workload-up");
    const steady = computePatterns(base({
      messages: [
        { content: "x", created_at: day("2026-11-03") },
        { content: "y", created_at: day("2026-11-09") },
      ],
    }));
    expect(alertKeys(steady)).not.toContain("workload-up");
  });

  it("flags today when today is historically the hardest weekday, and only then", () => {
    // NOW is a Tuesday; Tuesdays are the hardest in this fixture.
    const hardestToday = computePatterns(base({
      mood: [
        { stress_score: 9, mood_score: 2, created_at: day("2026-11-03") },
        { stress_score: 9, mood_score: 2, created_at: day("2026-11-10") },
        { stress_score: 2, mood_score: 9, created_at: day("2026-11-01") },
      ],
    }));
    expect(alertKeys(hardestToday)).toContain("hardest-weekday");
    // Sundays hardest instead — today (Tuesday) is not the hardest day.
    const hardestSunday = computePatterns(base({
      mood: [
        { stress_score: 9, mood_score: 2, created_at: day("2026-11-01") },
        { stress_score: 9, mood_score: 2, created_at: day("2026-11-08") },
        { stress_score: 2, mood_score: 9, created_at: day("2026-11-03") },
      ],
    }));
    expect(alertKeys(hardestSunday)).not.toContain("hardest-weekday");
  });

  it("flags no mood check-in in 7 days, and only then", () => {
    const none = computePatterns(base({
      messages: [{ content: "busy day", created_at: day("2026-11-09") }],
    }));
    expect(alertKeys(none)).toContain("no-mood-checkin");
    const recent = computePatterns(base({
      messages: [{ content: "busy day", created_at: day("2026-11-09") }],
      mood: [{ stress_score: 5, mood_score: 5, created_at: day("2026-11-08") }],
    }));
    expect(alertKeys(recent)).not.toContain("no-mood-checkin");
  });

  it("treats a 3-day quiet run as real rest (positive), and only then", () => {
    const rested = computePatterns(base({
      messages: [
        ...Array.from({ length: 10 }, (_, i) => ({ content: `heavy${i}`, created_at: day("2026-11-04") })),
        { content: "quiet", created_at: day("2026-11-08") },
        { content: "quiet", created_at: day("2026-11-09") },
        { content: "quiet", created_at: day("2026-11-10") },
      ],
    }));
    expect(rested.wellbeing.lowActivityDays).toBe(3);
    expect(rested.wellbeing.lowActivityStreak).toBe(3);
    expect(alertKeys(rested)).toContain("rest-streak");
    expect(rested.alerts.find((a) => a.key === "rest-streak")!.kind).toBe("positive");
    const twoDays = computePatterns(base({
      messages: [
        ...Array.from({ length: 10 }, (_, i) => ({ content: `heavy${i}`, created_at: day("2026-11-04") })),
        { content: "quiet", created_at: day("2026-11-09") },
        { content: "quiet", created_at: day("2026-11-10") },
      ],
    }));
    expect(alertKeys(twoDays)).not.toContain("rest-streak");
  });
});

describe("computePatterns — briefing", () => {
  it("mentions the real pattern and today's real tasks", () => {
    const r = computePatterns(base({
      mood: [
        { stress_score: 9, mood_score: 2, created_at: day("2026-11-03") },
        { stress_score: 9, mood_score: 2, created_at: day("2026-11-10") },
        { stress_score: 2, mood_score: 9, created_at: day("2026-11-01") },
      ],
      tasks: [
        { status: "todo", priority: "high", due_date: "2026-11-10", created_at: day("2026-11-09"), title: "Finish maths homework" },
      ],
    }));
    expect(r.briefing).toContain("Tuesday");
    expect(r.briefing).toContain("hardest");
    expect(r.briefing).toContain("Finish maths homework");
    expect(r.briefing).toContain("1 task due today");
    expect(templateBriefing(r)).toBe(r.briefing);
  });

  it("says nothing is due when no task is due today", () => {
    const r = computePatterns(base({
      mood: [{ stress_score: 5, mood_score: 5, created_at: day("2026-11-09") }],
    }));
    expect(r.briefing).toContain("Nothing is due today.");
  });
});
