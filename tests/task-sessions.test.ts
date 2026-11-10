import { describe, it, expect } from "vitest";
import {
  computeTaskReport,
  sessionMinutes,
  difficultyLabel,
  stressLabel,
  TASK_REPORT_DISCLAIMER,
} from "../lib/taskReport";

describe("difficultyLabel / stressLabel", () => {
  it("labels difficulty 1–5", () => {
    expect(difficultyLabel(1)).toBe("Very easy");
    expect(difficultyLabel(2)).toBe("Easy");
    expect(difficultyLabel(3)).toBe("Moderate");
    expect(difficultyLabel(4)).toBe("Hard");
    expect(difficultyLabel(5)).toBe("Very hard");
    expect(difficultyLabel(null)).toBeNull();
    expect(difficultyLabel(undefined)).toBeNull();
  });
  it("bands stress 1–3 Low, 4–6 Moderate, 7–10 High", () => {
    expect(stressLabel(1)).toBe("Low");
    expect(stressLabel(3)).toBe("Low");
    expect(stressLabel(4)).toBe("Moderate");
    expect(stressLabel(6)).toBe("Moderate");
    expect(stressLabel(7)).toBe("High");
    expect(stressLabel(10)).toBe("High");
    expect(stressLabel(null)).toBeNull();
  });
});

describe("sessionMinutes", () => {
  it("computes whole minutes between two timestamps", () => {
    expect(sessionMinutes("2026-11-10T10:00:00.000Z", "2026-11-10T10:45:30.000Z")).toBe(46);
    expect(sessionMinutes("2026-11-10T10:00:00.000Z", "2026-11-10T10:00:00.000Z")).toBe(0);
  });
  it("returns 0 when the end is missing without a now, or earlier than the start", () => {
    expect(sessionMinutes("2026-11-10T10:00:00.000Z", "2026-11-10T09:00:00.000Z")).toBe(0);
    expect(sessionMinutes("not-a-date", "2026-11-10T10:00:00.000Z")).toBe(0);
  });
  it("measures against an explicit now when the session is still running", () => {
    const now = Date.parse("2026-11-10T10:30:00.000Z");
    expect(sessionMinutes("2026-11-10T10:00:00.000Z", null, now)).toBe(30);
  });
});

describe("computeTaskReport", () => {
  it("reports planned vs actual with over/under and percent", () => {
    const r = computeTaskReport({ plannedMinutes: 60, actualMinutes: 90, difficulty: 3, stressAfter: 5 });
    expect(r.diffMinutes).toBe(30);
    expect(r.diffPct).toBe(50);
    expect(r.pace).toBe("much-over");
    expect(r.paceVerdict).toContain("much longer");
    expect(r.difficultyLabel).toBe("Moderate");
    expect(r.stressLabel).toBe("Moderate");
  });
  it("calls a run within ±15% on-plan", () => {
    const r = computeTaskReport({ plannedMinutes: 60, actualMinutes: 65, difficulty: 2, stressAfter: 2 });
    expect(r.pace).toBe("on-plan");
    expect(r.diffMinutes).toBe(5);
    expect(r.diffPct).toBe(8);
  });
  it("calls a fast easy run ahead of plan", () => {
    const r = computeTaskReport({ plannedMinutes: 60, actualMinutes: 30, difficulty: 1, stressAfter: 2 });
    expect(r.pace).toBe("ahead");
    expect(r.diffMinutes).toBe(-30);
    expect(r.diffPct).toBe(-50);
    expect(r.lines.join(" ")).toContain("generous");
  });
  it("handles no plan at all", () => {
    const r = computeTaskReport({ plannedMinutes: null, actualMinutes: 40, difficulty: 4, stressAfter: 8 });
    expect(r.diffMinutes).toBeNull();
    expect(r.diffPct).toBeNull();
    expect(r.pace).toBe("no-plan");
    expect(r.paceVerdict).toContain("No plan");
    expect(r.difficultyLabel).toBe("Hard");
    expect(r.stressLabel).toBe("High");
    expect(r.lines.join(" ")).toContain("stressed");
  });
  it("suggests breaking hard, long, stressful tasks into smaller steps", () => {
    const r = computeTaskReport({ plannedMinutes: 30, actualMinutes: 60, difficulty: 5, stressAfter: 9 });
    expect(r.lines.join(" ")).toContain("smaller steps");
    expect(r.lines.join(" ")).toContain("real break");
  });
  it("praises a steady on-plan low-stress run", () => {
    const r = computeTaskReport({ plannedMinutes: 45, actualMinutes: 45, difficulty: 3, stressAfter: 2 });
    expect(r.pace).toBe("on-plan");
    expect(r.lines.join(" ")).toContain("Steady run");
  });
  it("always carries the estimate disclaimer and 2–3 lines", () => {
    const r = computeTaskReport({ plannedMinutes: 30, actualMinutes: 30 });
    expect(r.disclaimer).toBe(TASK_REPORT_DISCLAIMER);
    expect(r.disclaimer).toContain("not a medical diagnosis");
    expect(r.lines.length).toBeGreaterThanOrEqual(1);
    expect(r.lines.length).toBeLessThanOrEqual(3);
    expect(r.difficultyLabel).toBeNull();
    expect(r.stressLabel).toBeNull();
  });
  it("clamps out-of-range ratings", () => {
    const r = computeTaskReport({ plannedMinutes: 30, actualMinutes: 30, difficulty: 9, stressAfter: 99 });
    expect(r.difficulty).toBe(5);
    expect(r.stressAfter).toBe(10);
  });
});
