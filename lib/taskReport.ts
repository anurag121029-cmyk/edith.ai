/**
 * Per-task session report — what a finished task/study run looked like.
 *
 * Pure and testable. From the plan (planned minutes), the reality (actual
 * minutes from the live timer), and how the run felt (difficulty 1–5,
 * stress afterwards 1–10), it produces: planned vs actual, difficulty and
 * stress labels, a pace verdict, and 2–3 short practical lines.
 *
 * This is an ESTIMATE from one session's numbers and the user's own
 * ratings. It is explicitly NOT a medical diagnosis or clinical
 * assessment — every UI surface that shows it must say so.
 */
export const TASK_REPORT_DISCLAIMER =
  "Estimate from this one session and your own ratings — not a medical diagnosis or clinical assessment.";

export const DIFFICULTY_LABELS: Record<number, string> = {
  1: "Very easy",
  2: "Easy",
  3: "Moderate",
  4: "Hard",
  5: "Very hard",
};
export type StressBand = "Low" | "Moderate" | "High";

export function difficultyLabel(difficulty: number | null | undefined): string | null {
  if (difficulty === null || difficulty === undefined) return null;
  return DIFFICULTY_LABELS[difficulty] || null;
}

export function stressLabel(stressAfter: number | null | undefined): StressBand | null {
  if (stressAfter === null || stressAfter === undefined) return null;
  if (stressAfter <= 3) return "Low";
  if (stressAfter <= 6) return "Moderate";
  return "High";
}

/** Whole minutes between two ISO timestamps (0 when the end is missing or earlier). */
export function sessionMinutes(startedAt: string, endedAt?: string | null, nowMs?: number): number {
  const start = Date.parse(startedAt);
  const end = endedAt ? Date.parse(endedAt) : (nowMs ?? Date.now());
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return Math.max(0, Math.round((end - start) / 60000));
}

export interface TaskReportInput {
  plannedMinutes?: number | null;
  actualMinutes: number;
  difficulty?: number | null;
  stressAfter?: number | null;
}

export interface TaskReport {
  plannedMinutes: number | null;
  actualMinutes: number;
  /** actual − planned in minutes, or null when there was no plan. */
  diffMinutes: number | null;
  /** (actual − planned) / planned × 100, or null when there was no plan. */
  diffPct: number | null;
  pace: "ahead" | "on-plan" | "over" | "much-over" | "no-plan";
  paceVerdict: string;
  difficulty: number | null;
  difficultyLabel: string | null;
  stressAfter: number | null;
  stressLabel: StressBand | null;
  /** 2–3 short practical lines. */
  lines: string[];
  disclaimer: string;
}

const clampInt = (n: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(n)));

export function computeTaskReport(input: TaskReportInput): TaskReport {
  const planned = input.plannedMinutes && input.plannedMinutes > 0 ? Math.round(input.plannedMinutes) : null;
  const actual = Math.max(0, Math.round(input.actualMinutes));
  const difficulty = input.difficulty ? clampInt(input.difficulty, 1, 5) : null;
  const stressAfter = input.stressAfter ? clampInt(input.stressAfter, 1, 10) : null;

  const diffMinutes = planned === null ? null : actual - planned;
  const diffPct = planned === null || diffMinutes === null ? null : Math.round((diffMinutes / planned) * 100);
  const ratio = planned === null ? null : actual / planned;
  const pace: TaskReport["pace"] =
    ratio === null ? "no-plan"
    : ratio <= 0.7 ? "ahead"
    : ratio <= 1.15 ? "on-plan"
    : ratio <= 1.4 ? "over"
    : "much-over";
  const paceVerdict =
    pace === "no-plan" ? "No plan to compare against — this run was untimed against a plan."
    : pace === "ahead" ? `Finished ${Math.abs(diffMinutes || 0)} min ahead of plan (${Math.abs(diffPct || 0)}% under).`
    : pace === "on-plan" ? `About on plan — ${actual} min against ${planned} planned (${diffPct === 0 ? "exactly" : `${diffPct && diffPct > 0 ? "+" : ""}${diffPct}%`}).`
    : pace === "over" ? `Took ${diffMinutes} min longer than planned (${diffPct}% over).`
    : `Took much longer than planned — ${actual} min against ${planned} planned (${diffPct}% over).`;

  const lines: string[] = [];
  if (pace === "much-over" || (pace === "over" && (difficulty || 0) >= 4)) {
    lines.push("This one ran long and felt hard — next time, break a task like this into smaller steps and schedule a short break between them.");
  } else if (pace === "over") {
    lines.push("It ran a little over plan. Add a small buffer (about 15 minutes) to similar tasks next time.");
  }
  if ((stressAfter || 0) >= 7) {
    lines.push("It left you feeling quite stressed. Plan a real break right after a task like this, and keep the next one lighter if you can.");
  } else if ((stressAfter || 0) >= 4 && pace !== "ahead") {
    lines.push("Stress was in the middle — a short pause halfway through may keep it from building up.");
  }
  if ((difficulty || 0) >= 4 && pace !== "much-over" && pace !== "over") {
    lines.push("It felt hard even though the time was close to plan — the effort was high, so give yourself credit and rest before the next hard one.");
  }
  if (pace === "ahead" && (difficulty || 0) <= 2) {
    lines.push("Quick and easy — the plan was generous. You can safely plan similar tasks a bit shorter, or fit two in one block.");
  }
  if (pace === "on-plan" && (difficulty || 0) <= 3 && (stressAfter || 0) <= 3) {
    lines.push("Steady run: on time, manageable, and low stress. This is a good size to repeat.");
  }
  if (lines.length === 0) {
    lines.push("A solid session. Keep the same plan size for similar work, and note anything that made it harder or easier.");
  }

  return {
    plannedMinutes: planned,
    actualMinutes: actual,
    diffMinutes,
    diffPct,
    pace,
    paceVerdict,
    difficulty,
    difficultyLabel: difficultyLabel(difficulty),
    stressAfter,
    stressLabel: stressLabel(stressAfter),
    lines: lines.slice(0, 3),
    disclaimer: TASK_REPORT_DISCLAIMER,
  };
}
