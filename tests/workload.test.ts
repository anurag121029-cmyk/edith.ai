import { describe, it, expect } from "vitest";
import { computeWorkloadAnalysis, templateWorkloadReport, pressureWordHits, WORKLOAD_DISCLAIMER, type WorkloadInputs } from "../lib/workload";

const NOW = new Date("2026-11-10T12:00:00.000Z"); // a Tuesday
const day = (iso: string) => `${iso}T10:00:00.000Z`;
function base(over: Partial<WorkloadInputs> = {}): WorkloadInputs {
  return {
    tasks: [
      { status: "done", priority: "medium", due_date: "2026-11-09", created_at: day("2026-11-08"), updated_at: day("2026-11-09") },
      { status: "todo", priority: "high", due_date: "2026-11-11", created_at: day("2026-11-08"), updated_at: day("2026-11-08") },
    ],
    study: [{ duration_minutes: 120, created_at: day("2026-11-09") }],
    messages: [
      { content: "I finished the report, feeling good", created_at: day("2026-11-09") },
      { content: "Need to plan tomorrow", created_at: day("2026-11-09") },
    ],
    mood: [{ stress_score: 4, created_at: day("2026-11-09") }],
    workload: [{ hours: 6, intensity: 5, created_at: day("2026-11-09") }],
    now: NOW,
    ...over,
  };
}

describe("computeWorkloadAnalysis", () => {
  it("returns the honest no-data state when there is no activity at all", () => {
    const r = computeWorkloadAnalysis({ tasks: [], study: [], messages: [], mood: [], workload: [], now: NOW });
    expect(r.score).toBeNull();
    expect(r.level).toBe("no-data");
    expect(r.missing).toHaveLength(5);
    expect(r.confidence).toBe(0);
    expect(r.busiestDay).toBeNull();
    expect(r.signals).toEqual([]);
    expect(r.disclaimer).toBe(WORKLOAD_DISCLAIMER);
    expect(templateWorkloadReport(r)).toContain("No activity yet");
  });

  it("scores a busy week from activity alone (no manual entries needed)", () => {
    const r = computeWorkloadAnalysis(base({ workload: [] }));
    expect(r.score).not.toBeNull();
    expect(r.missing).toContain("manual");
    expect(r.missing).not.toContain("tasks");
    expect(r.missing).not.toContain("study");
    expect(r.missing).not.toContain("chat");
    expect(r.confidence).toBe(0.8);
    expect(r.signals).toContain("1 task completed");
    expect(r.signals).toContain("120 study minutes");
    expect(r.signals).toContain("2 chat messages");
  });

  it("scores a heavy week high", () => {
    const r = computeWorkloadAnalysis(base({
      tasks: [
        { status: "done", priority: "medium", due_date: "2026-11-09", created_at: day("2026-11-09"), updated_at: day("2026-11-09") },
        { status: "done", priority: "medium", due_date: "2026-11-09", created_at: day("2026-11-09"), updated_at: day("2026-11-09") },
        { status: "done", priority: "medium", due_date: "2026-11-09", created_at: day("2026-11-08"), updated_at: day("2026-11-09") },
        { status: "todo", priority: "high", due_date: "2026-11-08", created_at: day("2026-11-01"), updated_at: day("2026-11-01") },
        { status: "todo", priority: "high", due_date: "2026-11-09", created_at: day("2026-11-01"), updated_at: day("2026-11-01") },
        { status: "todo", priority: "medium", due_date: "2026-11-12", created_at: day("2026-11-03"), updated_at: day("2026-11-03") },
      ],
      study: [{ duration_minutes: 1500, created_at: day("2026-11-09") }],
      messages: [
        { content: "I am so stressed and overwhelmed by these deadlines", created_at: day("2026-11-09") },
        { content: "too much work, exhausted and anxious", created_at: day("2026-11-09") },
        { content: "can't cope with the pressure", created_at: day("2026-11-08") },
      ],
      mood: [{ stress_score: 9, created_at: day("2026-11-09") }],
      workload: [{ hours: 14, intensity: 9, created_at: day("2026-11-09") }],
    }));
    expect(r.score!).toBeGreaterThanOrEqual(60);
    expect(r.level === "High" || r.level === "Very high").toBe(true);
    expect(r.signals.join(" ")).toContain("pressure word");
  });

  it("renormalises when sources are missing instead of inventing them", () => {
    // Only chat present (weight 20): 2 messages, no pressure words → value 6.
    const r = computeWorkloadAnalysis({
      tasks: [], study: [],
      messages: [
        { content: "hello", created_at: day("2026-11-09") },
        { content: "what is the plan", created_at: day("2026-11-09") },
      ],
      mood: [], workload: [], now: NOW,
    });
    expect(r.score).toBe(6);
    expect(r.missing).toEqual(expect.arrayContaining(["tasks", "study", "mood", "manual"]));
    expect(r.confidence).toBe(0.2);
  });

  it("computes per-day totals and the busiest day", () => {
    const r = computeWorkloadAnalysis(base());
    expect(r.daily).toHaveLength(7);
    // 2026-11-09: 1 completed task, 120 study minutes, 2 messages
    //   → 8*(0+1) + 120/4 + 5*2 = 8 + 30 + 10 = 48
    const nov9 = r.daily.find((d) => d.date === "2026-11-09")!;
    expect(nov9.tasksCompleted).toBe(1);
    expect(nov9.studyMinutes).toBe(120);
    expect(nov9.messages).toBe(2);
    expect(nov9.score).toBe(48);
    // 2026-11-08: 2 tasks created → 8*2 = 16
    const nov8 = r.daily.find((d) => d.date === "2026-11-08")!;
    expect(nov8.tasksCreated).toBe(2);
    expect(nov8.score).toBe(16);
    expect(r.busiestDay).toBe("2026-11-09");
    // Days with no activity score 0.
    expect(r.daily.find((d) => d.date === "2026-11-04")!.score).toBe(0);
  });

  it("compares the trend against the previous 7 days", () => {
    // Previous week (Oct 28–Nov 3) was empty; this week has activity → up.
    const up = computeWorkloadAnalysis(base());
    expect(up.trend.direction).toBe("up");
    expect(up.trend.delta).toBeGreaterThan(0);
    expect(up.trend.prevWeekAvg).toBe(0);
    // A quiet week after a busy one → down.
    const down = computeWorkloadAnalysis(base({
      tasks: [{ status: "todo", priority: "medium", due_date: "2026-11-12", created_at: day("2026-11-01"), updated_at: day("2026-11-01") }],
      study: [{ duration_minutes: 600, created_at: day("2026-10-30") }],
      messages: [{ content: "busy busy busy", created_at: day("2026-10-30") }],
      mood: [],
      workload: [],
    }));
    expect(down.trend.direction).toBe("down");
    expect(down.trend.delta).toBeLessThan(0);
    // Two identical weeks → flat.
    const flat = computeWorkloadAnalysis(base({
      study: [
        { duration_minutes: 60, created_at: day("2026-11-09") },
        { duration_minutes: 60, created_at: day("2026-11-02") },
      ],
      tasks: [], messages: [], mood: [], workload: [],
    }));
    expect(flat.trend.direction).toBe("flat");
    expect(flat.trend.delta).toBe(0);
  });

  it("ignores activity older than 14 days", () => {
    const r = computeWorkloadAnalysis(base({
      study: [
        { duration_minutes: 120, created_at: day("2026-11-09") },
        { duration_minutes: 9999, created_at: day("2026-10-20") },
      ],
      messages: [
        { content: "I finished the report, feeling good", created_at: day("2026-11-09") },
        { content: "stressed overwhelmed anxious", created_at: day("2026-10-20") },
      ],
    }));
    // Only the in-window study (120 min) counts; the old 9999 min does not.
    expect(r.sources.find((s) => s.key === "study")!.detail).toContain("120 study minutes");
  });
});

describe("pressureWordHits", () => {
  it("counts distinct pressure words from the shared stress list", () => {
    // Substring matching, same as lib/stress.ts: "stress" matches inside
    // "stressed", "overwhelm" inside "overwhelmed" — 6 hits total.
    expect(pressureWordHits(["I am stressed and overwhelmed by the deadline pressure"])).toBe(6);
    expect(pressureWordHits(["feeling calm and relaxed today"])).toBe(0);
  });
});

describe("templateWorkloadReport", () => {
  it("writes a report naming the level, trend and busiest day", () => {
    const r = computeWorkloadAnalysis(base());
    const text = templateWorkloadReport(r);
    expect(text).toContain(`${r.score}/100`);
    expect(text).toContain("2026-11-09");
    expect(text.length).toBeGreaterThan(50);
  });
});
