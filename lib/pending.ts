/**
 * Pending-task detection and the auto-reminder default.
 *
 * A task is "pending — you haven't done this" when its start time (or
 * its due date) has already passed and it is still not done. This is
 * the "you forgot this task" list on the Tasks page and the dashboard,
 * and the trigger for the once-a-day pending notification.
 *
 * The auto-reminder rule: when a task is added with a start time but no
 * reminder, the reminder defaults to the start time; when only a due
 * date is set, it defaults to 09:00 local on that date. Nothing here
 * invents a time — it only derives the reminder from the plan the user
 * already entered.
 */

export interface PendingTaskInput {
  id: string;
  title: string;
  status: string;
  start_time?: string | null;
  due_date?: string | null;
  place?: string | null;
  planned_minutes?: number | null;
  reminder_at?: string | null;
}

/** True when the task's start time (or due date) has passed and it is not done. */
export function isPendingTask(t: PendingTaskInput, now: Date = new Date()): boolean {
  if (t.status === "done") return false;
  const startMs = t.start_time ? Date.parse(t.start_time) : NaN;
  if (Number.isFinite(startMs) && startMs < now.getTime()) return true;
  if (t.due_date) {
    const today = now.toISOString().slice(0, 10);
    if (t.due_date.slice(0, 10) < today) return true;
  }
  return false;
}

/** Pending tasks, soonest start first. */
export function pendingTasks(tasks: PendingTaskInput[], now: Date = new Date()): PendingTaskInput[] {
  return tasks
    .filter((t) => isPendingTask(t, now))
    .sort((a, b) => {
      const aT = a.start_time ? Date.parse(a.start_time) : a.due_date ? Date.parse(a.due_date) : Infinity;
      const bT = b.start_time ? Date.parse(b.start_time) : b.due_date ? Date.parse(b.due_date) : Infinity;
      return aT - bT;
    });
}

/**
 * The reminder to use when the user did not set one: the start time
 * when there is one, otherwise 09:00 local on the due date, otherwise
 * null (no reminder can be derived). Returns an ISO string.
 */
export function defaultReminderAt(input: { start_time?: string | null; due_date?: string | null }): string | null {
  if (input.start_time) {
    const d = new Date(input.start_time);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  if (input.due_date) {
    const date = input.due_date.slice(0, 10);
    const d = new Date(`${date}T09:00:00`);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return null;
}
