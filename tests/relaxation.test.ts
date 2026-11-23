import { describe, it, expect } from "vitest";
import {
  RELAXATION_SESSIONS,
  getSession,
  phaseAt,
  progressAt,
  sessionDone,
  sessionTotalSeconds,
  relaxScale,
  validateSessions,
  relaxationRecord,
  type SessionDef,
} from "../lib/relaxation";

const box = getSession("box-breathing")!;
const bodyScan = getSession("body-scan")!;

describe("session library", () => {
  it("has seven sessions with the promised lengths", () => {
    expect(RELAXATION_SESSIONS).toHaveLength(7);
    expect(RELAXATION_SESSIONS.map((s) => s.id)).toEqual([
      "box-breathing",
      "breathing-478",
      "quick-reset",
      "quick-calm-60",
      "body-scan",
      "muscle-relaxation",
      "calm-place",
    ]);
    expect(new Map(RELAXATION_SESSIONS.map((s) => [s.id, s.minutes]))).toEqual(
      new Map([
        ["box-breathing", 2],
        ["breathing-478", 2],
        ["quick-reset", 2],
        ["quick-calm-60", 1],
        ["body-scan", 5],
        ["muscle-relaxation", 7],
        ["calm-place", 5],
      ]),
    );
  });

  it("every session passes validation (unique ids, positive steps, exact totals)", () => {
    expect(validateSessions(RELAXATION_SESSIONS)).toEqual([]);
    expect(sessionTotalSeconds(box)).toBe(120);
    expect(sessionTotalSeconds(getSession("breathing-478")!)).toBe(120);
    expect(sessionTotalSeconds(getSession("quick-reset")!)).toBe(120);
    expect(sessionTotalSeconds(bodyScan)).toBe(300);
    expect(sessionTotalSeconds(getSession("muscle-relaxation")!)).toBe(420);
    expect(sessionTotalSeconds(getSession("calm-place")!)).toBe(300);
  });

  it("box breathing reuses the 4-4-4-4 pattern (30 steps: 7 full cycles + inhale + hold)", () => {
    expect(box.steps).toHaveLength(30);
    expect(box.steps.slice(0, 4).map((s) => [s.label, s.seconds])).toEqual([
      ["Inhale", 4],
      ["Hold", 4],
      ["Exhale", 4],
      ["Hold", 4],
    ]);
    expect(box.steps.slice(-2).map((s) => [s.label, s.seconds])).toEqual([
      ["Inhale", 4],
      ["Hold", 4],
    ]);
  });

  it("4-7-8 breathing is six 19-second cycles plus a 6-second rest", () => {
    const s = getSession("breathing-478")!;
    expect(s.steps).toHaveLength(19);
    expect(s.steps.slice(0, 3).map((x) => [x.label, x.seconds])).toEqual([
      ["Inhale", 4],
      ["Hold", 7],
      ["Exhale", 8],
    ]);
    expect(s.steps[18]).toEqual({
      label: "Rest",
      seconds: 6,
      instruction: "Breathe normally for a moment. Notice how much slower everything feels.",
    });
  });

  it("quick-calm-60 is exactly 60 seconds: six rounds of 4s in / 6s out", () => {
    const s = getSession("quick-calm-60")!;
    expect(sessionTotalSeconds(s)).toBe(60);
    expect(s.minutes).toBe(1);
    expect(s.steps).toHaveLength(12);
    expect(s.steps.map((x) => [x.label, x.seconds])).toEqual(
      Array.from({ length: 6 }, () => [["Breathe in", 4], ["Breathe out", 6]]).flat(),
    );
  });

  it("quick-calm-60 walks inhale → exhale every 10 seconds and ends at 60s", () => {
    const s = getSession("quick-calm-60")!;
    expect(phaseAt(s, 0).label).toBe("Breathe in");
    expect(phaseAt(s, 4).label).toBe("Breathe out");
    expect(phaseAt(s, 10).label).toBe("Breathe in");
    expect(phaseAt(s, 10).stepIndex).toBe(2);
    expect(phaseAt(s, 54).label).toBe("Breathe out");
    expect(phaseAt(s, 59).done).toBe(false);
    expect(phaseAt(s, 60).done).toBe(true);
    expect(sessionDone(s, 60)).toBe(true);
    expect(progressAt(s, 30)).toBe(0.5);
  });

  it("quick-calm-60 circle grows on the in-breath and shrinks on the out-breath", () => {
    const s = getSession("quick-calm-60")!;
    expect(relaxScale(s, phaseAt(s, 0))).toBeCloseTo(0.6);
    expect(relaxScale(s, phaseAt(s, 2))).toBeCloseTo(0.8);
    expect(relaxScale(s, phaseAt(s, 4))).toBeCloseTo(1);
    expect(relaxScale(s, phaseAt(s, 7))).toBeCloseTo(0.8);
    expect(relaxScale(s, phaseAt(s, 10))).toBeCloseTo(0.6);
  });

  it("getSession returns null for an unknown id", () => {
    expect(getSession("nope")).toBeNull();
  });
});

describe("validateSessions", () => {
  it("catches duplicate ids", () => {
    const dup: SessionDef[] = [box, { ...box }];
    expect(validateSessions(dup).join(" ")).toContain("Duplicate session id: box-breathing.");
  });

  it("catches a steps total that does not match minutes", () => {
    const bad: SessionDef = { ...box, minutes: 3 };
    expect(validateSessions([bad]).join(" ")).toContain("steps sum to 120s but minutes say 3 (180s).");
  });

  it("catches a zero-second step and a missing instruction", () => {
    const bad: SessionDef = {
      ...box,
      steps: [
        { label: "Inhale", seconds: 0, instruction: "Breathe in." },
        { label: "Hold", seconds: 4, instruction: "" },
      ],
    };
    const errors = validateSessions([bad]);
    expect(errors.some((e) => e.includes("invalid seconds"))).toBe(true);
    expect(errors.some((e) => e.includes("missing an instruction"))).toBe(true);
  });

  it("catches an invalid category", () => {
    const bad = { ...box, category: "sleep" } as unknown as SessionDef;
    expect(validateSessions([bad]).join(" ")).toContain("invalid category");
  });
});

describe("phaseAt — step boundaries", () => {
  it("starts on Inhale at 0s", () => {
    const p = phaseAt(box, 0);
    expect(p.stepIndex).toBe(0);
    expect(p.label).toBe("Inhale");
    expect(p.stepElapsed).toBe(0);
    expect(p.stepTotal).toBe(4);
    expect(p.totalElapsed).toBe(0);
    expect(p.totalSeconds).toBe(120);
    expect(p.done).toBe(false);
  });

  it("moves to Hold at 4s, Exhale at 8s, and the second cycle at 16s", () => {
    expect(phaseAt(box, 4).label).toBe("Hold");
    expect(phaseAt(box, 4).stepIndex).toBe(1);
    expect(phaseAt(box, 8).label).toBe("Exhale");
    expect(phaseAt(box, 8).stepIndex).toBe(2);
    const p16 = phaseAt(box, 16);
    expect(p16.label).toBe("Inhale");
    expect(p16.stepIndex).toBe(4);
    expect(p16.stepElapsed).toBe(0);
  });

  it("is inside the final Hold step at 119s", () => {
    const p = phaseAt(box, 119);
    expect(p.stepIndex).toBe(29);
    expect(p.label).toBe("Hold");
    expect(p.stepElapsed).toBe(3);
    expect(p.done).toBe(false);
  });

  it("is done at exactly the end, and clamps beyond it", () => {
    const p = phaseAt(box, 120);
    expect(p.done).toBe(true);
    expect(p.totalElapsed).toBe(120);
    expect(p.stepIndex).toBe(29);
    expect(p.stepElapsed).toBe(4);
    const late = phaseAt(box, 200);
    expect(late.done).toBe(true);
    expect(late.totalElapsed).toBe(120);
    expect(sessionDone(box, 120)).toBe(true);
    expect(sessionDone(box, 119)).toBe(false);
  });

  it("clamps negative elapsed to 0", () => {
    expect(phaseAt(box, -5).totalElapsed).toBe(0);
    expect(phaseAt(box, -5).stepIndex).toBe(0);
  });

  it("walks the body scan one part per 30 seconds", () => {
    expect(phaseAt(bodyScan, 0).label).toBe("Feet");
    expect(phaseAt(bodyScan, 30).label).toBe("Legs");
    expect(phaseAt(bodyScan, 270).label).toBe("Whole body");
    expect(phaseAt(bodyScan, 300).done).toBe(true);
  });
});

describe("progressAt", () => {
  it("goes 0 → 1 across the session and clamps outside", () => {
    expect(progressAt(box, 0)).toBe(0);
    expect(progressAt(box, 60)).toBe(0.5);
    expect(progressAt(box, 120)).toBe(1);
    expect(progressAt(box, -5)).toBe(0);
    expect(progressAt(box, 500)).toBe(1);
  });
});

describe("relaxScale — the animated circle", () => {
  it("grows while inhaling and stays full while holding after an inhale", () => {
    expect(relaxScale(box, phaseAt(box, 0))).toBeCloseTo(0.6);
    expect(relaxScale(box, phaseAt(box, 2))).toBeCloseTo(0.8);
    expect(relaxScale(box, phaseAt(box, 4))).toBeCloseTo(1);
  });

  it("shrinks while exhaling and stays small while holding after an exhale", () => {
    expect(relaxScale(box, phaseAt(box, 8))).toBeCloseTo(1);
    expect(relaxScale(box, phaseAt(box, 10))).toBeCloseTo(0.8);
    expect(relaxScale(box, phaseAt(box, 12))).toBeCloseTo(0.6);
  });

  it("rests at 0.8 for body steps", () => {
    expect(relaxScale(bodyScan, phaseAt(bodyScan, 0))).toBeCloseTo(0.8);
    expect(relaxScale(bodyScan, phaseAt(bodyScan, 15))).toBeCloseTo(0.8);
  });
});

describe("relaxationRecord — the finish flow's saved shape", () => {
  it("builds a completed record with the session id and duration", () => {
    expect(relaxationRecord("box-breathing", 120, null)).toEqual({
      session_id: "box-breathing",
      duration_seconds: 120,
      completed: true,
      mood_after: null,
    });
  });

  it("records the mood when given and clamps it to 1–10", () => {
    expect(relaxationRecord("body-scan", 300, 7).mood_after).toBe(7);
    expect(relaxationRecord("body-scan", 300, 15).mood_after).toBe(10);
    expect(relaxationRecord("body-scan", 300, 0).mood_after).toBe(1);
    expect(relaxationRecord("body-scan", 300, undefined as unknown as null).mood_after).toBeNull();
  });
});
