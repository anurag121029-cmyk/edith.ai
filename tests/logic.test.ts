import { describe, it, expect } from "vitest";
import { workloadSummary, moodTrend, stressSuggestion, validateChatInput, validateEmail, taskCompletion, tasksDueToday, weeklyReport, weekBounds, clampScore, searchMemories } from "../lib/logic";
import { createRateLimiter, clientIpFromHeaders } from "../lib/rateLimit";
describe("workloadSummary", () => {
  it("empty", () => { expect(workloadSummary([])).toMatchObject({ count: 0, totalHours: 0, level: "low" }); });
  it("high intensity", () => { expect(workloadSummary([{ hours: 5, intensity: 9 }]).level).toBe("high"); });
  it("sums hours", () => { expect(workloadSummary([{ hours: 2.5 }, { hours: 2.5 }]).totalHours).toBe(5); });
});
describe("mood/stress", () => {
  it("averages", () => { const r = moodTrend([{ mood_score: 8, stress_score: 4 }, { mood_score: 6, stress_score: 6 }]); expect(r.avgMood).toBe(7); expect(r.avgStress).toBe(5); });
  it("no data suggestion", () => { expect(stressSuggestion(null)).toContain("No check-ins"); });
  it("high stress suggestion is non-clinical", () => { expect(stressSuggestion(9)).toContain("self-reported"); });
});
describe("validation", () => {
  it("rejects empty", () => { expect(validateChatInput("  ").ok).toBe(false); });
  it("rejects too long", () => { expect(validateChatInput("x".repeat(4001)).ok).toBe(false); });
  it("accepts normal", () => { expect(validateChatInput(" hello ")).toEqual({ ok: true, value: "hello" }); });
  it("email", () => { expect(validateEmail("a@b.co")).toBe(true); expect(validateEmail("nope")).toBe(false); });
  it("clamp", () => { expect(clampScore(99)).toBe(10); expect(clampScore(0)).toBe(1); });
});
describe("tasks & weekly report", () => {
  const tasks = [{ status: "done", due_date: "2026-10-20", created_at: "2026-10-20" }, { status: "todo", due_date: "2026-10-20", created_at: "2026-10-19" }, { status: "todo", due_date: "2026-10-21", created_at: "2026-10-19" }];
  it("completion", () => { expect(taskCompletion(tasks)).toMatchObject({ total: 3, done: 1, pct: 33 }); });
  it("due today", () => { expect(tasksDueToday(tasks, "2026-10-20")).toHaveLength(1); });
  it("weekly aggregation", () => {
    const r = weeklyReport({ tasks, study: [{ duration_minutes: 30, created_at: "2026-10-20" }, { duration_minutes: 15, created_at: "2026-10-21" }], workload: [{ hours: 3, intensity: 5, created_at: "2026-10-20" }], mood: [{ mood_score: 7, stress_score: 3, created_at: "2026-10-20" }], weekStart: "2026-10-19", weekEnd: "2026-10-25" });
    expect(r.studyMinutes).toBe(45); expect(r.tasksCompleted).toBe(1); expect(r.workloadHours).toBe(3); expect(r.avgMood).toBe(7);
  });
  it("week bounds are Mon-Sun", () => { const b = weekBounds(new Date("2026-10-22T12:00:00Z")); expect(b).toEqual({ start: "2026-10-19", end: "2026-10-25" }); });
});
describe("rate limiter", () => {
  it("allows up to the limit, then blocks with retry-after", () => {
    const lim = createRateLimiter(2, 60_000);
    expect(lim.check("1.2.3.4", 1000).allowed).toBe(true);
    expect(lim.check("1.2.3.4", 2000).allowed).toBe(true);
    const blocked = lim.check("1.2.3.4", 3000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });
  it("resets after the window and isolates keys", () => {
    const lim = createRateLimiter(1, 1000);
    expect(lim.check("a", 0).allowed).toBe(true);
    expect(lim.check("b", 0).allowed).toBe(true);
    expect(lim.check("a", 500).allowed).toBe(false);
    expect(lim.check("a", 1000).allowed).toBe(true);
  });
  it("falls back to anonymous without headers", () => {
    expect(clientIpFromHeaders(new Headers())).toBe("anonymous");
    expect(clientIpFromHeaders(new Headers({ "x-forwarded-for": "9.9.9.9, 1.1.1.1" }))).toBe("9.9.9.9");
  });
});
describe("memory search", () => {
  const mems = [
    { title: "Run a marathon", content: "train slowly", category: "goal", created_at: "2026-10-20T00:00:00Z" },
    { title: "Daily notes", content: "I love marathon training", category: "learning", created_at: "2026-10-21T00:00:00Z" },
    { title: "Cooking", content: "pasta recipes", category: "preference", created_at: "2026-10-22T00:00:00Z" },
  ];
  it("ranks title matches above content matches", () => {
    const r = searchMemories(mems, "marathon");
    expect(r.map((m) => m.title)).toEqual(["Run a marathon", "Daily notes"]);
  });
  it("matches category and returns empty query unchanged", () => {
    expect(searchMemories(mems, "goal").map((m) => m.title)).toEqual(["Run a marathon"]);
    expect(searchMemories(mems, "  ")).toHaveLength(3);
  });
  it("excludes non-matches and breaks ties by recency", () => {
    expect(searchMemories(mems, "pasta").map((m) => m.title)).toEqual(["Cooking"]);
    const tied = [
      { title: "Alpha run", content: "", category: "", created_at: "2026-10-19T00:00:00Z" },
      { title: "Beta run", content: "", category: "", created_at: "2026-10-21T00:00:00Z" },
    ];
    expect(searchMemories(tied, "run").map((m) => m.title)).toEqual(["Beta run", "Alpha run"]);
  });
});
