import { describe, it, expect } from "vitest";
import { phaseAt, breathScale, sessionDone, BREATH_SESSION_SECONDS } from "../lib/breathing";
import { isPendingTask, pendingTasks, defaultReminderAt } from "../lib/pending";

describe("box breathing phase math", () => {
  it("walks the 16-second cycle: inhale, hold, exhale, hold", () => {
    expect(phaseAt(0).phase).toBe("Inhale");
    expect(phaseAt(0).cycle).toBe(1);
    expect(phaseAt(3.9).phase).toBe("Inhale");
    expect(phaseAt(4).phase).toBe("Hold");
    expect(phaseAt(7.9).phase).toBe("Hold");
    expect(phaseAt(8).phase).toBe("Exhale");
    expect(phaseAt(11.9).phase).toBe("Exhale");
    expect(phaseAt(12).phase).toBe("Hold");
    expect(phaseAt(15.9).phase).toBe("Hold");
    expect(phaseAt(16).phase).toBe("Inhale");
    expect(phaseAt(16).cycle).toBe(2);
    expect(phaseAt(32).cycle).toBe(3);
  });

  it("phase remaining counts down within each 4-second step", () => {
    expect(phaseAt(0).phaseRemaining).toBe(4);
    expect(phaseAt(1).phaseRemaining).toBe(3);
    expect(phaseAt(5).phaseRemaining).toBe(3);
    expect(phaseAt(9).phaseElapsed).toBe(1);
  });

  it("the circle grows on inhale, stays full on the hold, shrinks on exhale, stays small on the hold", () => {
    expect(breathScale(phaseAt(0))).toBeCloseTo(0.6);
    expect(breathScale(phaseAt(2))).toBeCloseTo(0.8);
    expect(breathScale(phaseAt(4))).toBeCloseTo(1);
    expect(breathScale(phaseAt(6))).toBeCloseTo(1);
    expect(breathScale(phaseAt(10))).toBeCloseTo(0.8);
    expect(breathScale(phaseAt(12))).toBeCloseTo(0.6);
    expect(breathScale(phaseAt(14))).toBeCloseTo(0.6);
  });

  it("a session is 2 minutes", () => {
    expect(BREATH_SESSION_SECONDS).toBe(120);
    expect(sessionDone(119)).toBe(false);
    expect(sessionDone(120)).toBe(true);
    expect(phaseAt(120).done).toBe(true);
    expect(phaseAt(119).done).toBe(false);
  });
});

describe("pending-task detection (you forgot this task)", () => {
  const now = new Date("2026-11-10T12:00:00.000Z");
  const base = { id: "t1", title: "Maths", status: "todo" };

  it("start time passed + not done → pending", () => {
    expect(isPendingTask({ ...base, start_time: "2026-11-10T09:00:00.000Z" }, now)).toBe(true);
  });

  it("done tasks are never pending, even when the start passed", () => {
    expect(isPendingTask({ ...base, status: "done", start_time: "2026-11-10T09:00:00.000Z" }, now)).toBe(false);
  });

  it("start time in the future → not pending", () => {
    expect(isPendingTask({ ...base, start_time: "2026-11-10T15:00:00.000Z" }, now)).toBe(false);
  });

  it("no start time and no due date → not pending", () => {
    expect(isPendingTask({ ...base }, now)).toBe(false);
  });

  it("due date yesterday → pending; due today → not pending", () => {
    expect(isPendingTask({ ...base, due_date: "2026-11-09" }, now)).toBe(true);
    expect(isPendingTask({ ...base, due_date: "2026-11-10" }, now)).toBe(false);
    expect(isPendingTask({ ...base, due_date: "2026-11-11" }, now)).toBe(false);
  });

  it("pendingTasks lists only pending tasks, soonest first", () => {
    const list = pendingTasks([
      { id: "a", title: "A", status: "todo", start_time: "2026-11-10T11:00:00.000Z" },
      { id: "b", title: "B", status: "done", start_time: "2026-11-10T08:00:00.000Z" },
      { id: "c", title: "C", status: "todo", start_time: "2026-11-10T08:00:00.000Z" },
      { id: "d", title: "D", status: "todo" },
    ], now);
    expect(list.map((t) => t.id)).toEqual(["c", "a"]);
  });
});

describe("auto-reminder default rule", () => {
  it("start time set → reminder is the start time", () => {
    expect(defaultReminderAt({ start_time: "2026-11-10T17:30:00.000Z" })).toBe("2026-11-10T17:30:00.000Z");
  });

  it("only a due date → reminder is 09:00 local on that date", () => {
    const expected = new Date("2026-11-12T09:00:00").toISOString();
    expect(defaultReminderAt({ due_date: "2026-11-12" })).toBe(expected);
  });

  it("start time wins over the due date", () => {
    expect(defaultReminderAt({ start_time: "2026-11-10T17:30:00.000Z", due_date: "2026-11-12" })).toBe("2026-11-10T17:30:00.000Z");
  });

  it("neither set → no reminder can be derived", () => {
    expect(defaultReminderAt({})).toBe(null);
    expect(defaultReminderAt({ start_time: null, due_date: null })).toBe(null);
  });
});
