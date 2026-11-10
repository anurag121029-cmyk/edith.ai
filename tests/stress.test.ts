import { describe, it, expect } from "vitest";
import { computeStressScore, computeDailyTrend, chatMoodScore, stressLevel, STRESS_DISCLAIMER, type StressInputs } from "../lib/stress";

const NOW = new Date("2026-11-10T12:00:00.000Z");
const day = (iso: string) => `${iso}T10:00:00.000Z`;
function base(over: Partial<StressInputs> = {}): StressInputs {
  return {
    mood: [{ stress_score: 4, created_at: day("2026-11-09") }],
    workload: [{ hours: 6, intensity: 5, created_at: day("2026-11-09") }],
    tasks: [{ status: "todo", priority: "medium", due_date: "2026-11-12", created_at: day("2026-11-08") }],
    study: [{ duration_minutes: 120, created_at: day("2026-11-09") }],
    chatTexts: ["Feeling calm today, got a good night's sleep."],
    now: NOW,
    ...over,
  };
}

describe("computeStressScore", () => {
  it("returns no-data when nothing exists", () => {
    const r = computeStressScore({ mood: [], workload: [], tasks: [], study: [], chatTexts: [], now: NOW });
    expect(r.score).toBeNull();
    expect(r.level).toBe("no-data");
    expect(r.missing).toHaveLength(5);
    expect(r.confidence).toBe(0);
    expect(r.disclaimer).toBe(STRESS_DISCLAIMER);
  });

  it("scores a calm week low", () => {
    const r = computeStressScore(base());
    expect(r.score).not.toBeNull();
    expect(r.score!).toBeLessThan(40);
    expect(r.level).toBe("Low");
    expect(r.missing).toEqual([]);
    expect(r.confidence).toBe(1);
  });

  it("scores a stressed week high", () => {
    const r = computeStressScore(base({
      mood: [{ stress_score: 9, created_at: day("2026-11-09") }, { stress_score: 8, created_at: day("2026-11-08") }],
      workload: [{ hours: 12, intensity: 9, created_at: day("2026-11-09") }],
      tasks: [
        { status: "todo", priority: "high", due_date: "2026-11-08", created_at: day("2026-11-01") },
        { status: "todo", priority: "high", due_date: "2026-11-09", created_at: day("2026-11-01") },
        { status: "todo", priority: "high", due_date: "2026-11-10", created_at: day("2026-11-01") },
        { status: "in_progress", priority: "medium", due_date: "2026-11-11", created_at: day("2026-11-02") },
      ],
      study: [{ duration_minutes: 600, created_at: day("2026-11-09") }],
      chatTexts: ["I am so stressed and overwhelmed, I can't cope with these deadlines, exhausted"],
    }));
    expect(r.score!).toBeGreaterThanOrEqual(60);
    expect(r.level === "High" || r.level === "Very high").toBe(true);
    expect(r.suggestions.length).toBeGreaterThan(0);
  });

  it("renormalises when factors are missing instead of inventing them", () => {
    const onlyMood = computeStressScore({ mood: [{ stress_score: 8, created_at: day("2026-11-09") }], workload: [], tasks: [], study: [], chatTexts: [], now: NOW });
    // Only self-report present (weight 30): score is its value alone.
    expect(onlyMood.score).toBe(80);
    expect(onlyMood.missing).toContain("workload");
    expect(onlyMood.missing).toContain("chat");
    expect(onlyMood.confidence).toBeCloseTo(0.2);
  });

  it("ignores data older than 7 days", () => {
    const r = computeStressScore(base({
      mood: [{ stress_score: 10, created_at: day("2026-10-20") }],
      workload: [{ hours: 20, intensity: 10, created_at: day("2026-10-20") }],
    }));
    // Old mood/workload are outside the window; the remaining factors are calm.
    expect(r.factors.find((f) => f.key === "selfReport")!.missing).toBe(true);
    expect(r.score!).toBeLessThan(40);
  });

  it("overdue tasks raise the task factor", () => {
    const withOverdue = computeStressScore(base({ tasks: [{ status: "todo", priority: "high", due_date: "2026-11-01", created_at: day("2026-11-01") }] }));
    const noTasks = computeStressScore(base({ tasks: [] }));
    expect(withOverdue.factors.find((f) => f.key === "tasks")!.value!).toBeGreaterThan(0);
    expect(noTasks.factors.find((f) => f.key === "tasks")!.missing).toBe(true);
  });
});

describe("chatMoodScore", () => {
  it("is neutral with no signal words and high with stress words", () => {
    expect(chatMoodScore(["hello there"]).score).toBe(50);
    expect(chatMoodScore(["I feel stressed, overwhelmed and exhausted"]).score).toBeGreaterThan(70);
    expect(chatMoodScore(["calm and relaxed, slept well, feeling great"]).score).toBeLessThan(40);
  });
});

describe("stressLevel", () => {
  it("bands the score", () => {
    expect(stressLevel(null)).toBe("no-data");
    expect(stressLevel(0)).toBe("Low");
    expect(stressLevel(29)).toBe("Low");
    expect(stressLevel(30)).toBe("Moderate");
    expect(stressLevel(50)).toBe("High");
    expect(stressLevel(70)).toBe("Very high");
    expect(stressLevel(100)).toBe("Very high");
  });
});

describe("computeDailyTrend", () => {
  it("returns one entry per day with the most recent last", () => {
    const t = computeDailyTrend(base(), 7);
    expect(t).toHaveLength(7);
    expect(t[6].date).toBe("2026-11-10");
    expect(t[0].date).toBe("2026-11-04");
  });
  it("is null on days with no data at all", () => {
    const t = computeDailyTrend({ mood: [], workload: [], tasks: [], study: [], chatTexts: [], now: NOW }, 7);
    expect(t.every((d) => d.score === null)).toBe(true);
  });
});
