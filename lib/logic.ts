export interface TaskLike { status: string; due_date?: string | null; priority?: string | null; category?: string | null; created_at?: string }
export interface MoodLike { mood_score?: number | null; stress_score?: number | null; created_at?: string }
export interface WorkloadLike { hours?: number | null; intensity?: number | null; created_at?: string }
export interface StudyLike { duration_minutes?: number | null; created_at?: string }

export function clampScore(n: number, min = 1, max = 10): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.round(n)));
}
export function validateChatInput(input: unknown, maxLength = 4000): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof input !== "string") return { ok: false, error: "Message must be a string." };
  const v = input.trim();
  if (!v) return { ok: false, error: "Message must not be empty." };
  if (v.length > maxLength) return { ok: false, error: `Message exceeds ${maxLength} characters.` };
  return { ok: true, value: v };
}
export function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}
export function workloadSummary(entries: WorkloadLike[]) {
  const totalHours = entries.reduce((s, e) => s + (Number(e.hours) || 0), 0);
  const avgIntensity = entries.length ? entries.reduce((s, e) => s + (Number(e.intensity) || 0), 0) / entries.length : 0;
  let level: "low" | "moderate" | "high" = "low";
  if (avgIntensity >= 7 || totalHours > 40) level = "high";
  else if (avgIntensity >= 4 || totalHours > 20) level = "moderate";
  return { count: entries.length, totalHours: Math.round(totalHours * 10) / 10, avgIntensity: Math.round(avgIntensity * 10) / 10, level };
}
export function moodTrend(checkins: MoodLike[]) {
  if (!checkins.length) return { count: 0, avgMood: null as number | null, avgStress: null as number | null, direction: "no-data" as const };
  const avgMood = checkins.reduce((s, c) => s + (Number(c.mood_score) || 0), 0) / checkins.length;
  const avgStress = checkins.reduce((s, c) => s + (Number(c.stress_score) || 0), 0) / checkins.length;
  return { count: checkins.length, avgMood: Math.round(avgMood * 10) / 10, avgStress: Math.round(avgStress * 10) / 10, direction: "stable" as const };
}
/** Non-clinical wellness suggestion based only on user-reported averages. */
export function stressSuggestion(avgStress: number | null): string {
  if (avgStress === null) return "No check-ins yet — add one to see a summary here.";
  if (avgStress >= 7) return "Your self-reported stress is high this period. Consider a break, a smaller task list, and talking to someone you trust if it persists.";
  if (avgStress >= 4) return "Your self-reported stress is moderate. Regular breaks and prioritising one task at a time may help.";
  return "Your self-reported stress is low this period. Keep up the routines that are working.";
}
export function tasksDueToday(tasks: TaskLike[], todayISO: string): TaskLike[] {
  return tasks.filter((t) => t.status !== "done" && t.due_date && t.due_date.slice(0, 10) === todayISO);
}
export function taskCompletion(tasks: TaskLike[]) {
  const total = tasks.length;
  const done = tasks.filter((t) => t.status === "done").length;
  return { total, done, pct: total ? Math.round((done / total) * 100) : 0 };
}
export function weeklyReport(input: { tasks: TaskLike[]; study: StudyLike[]; workload: WorkloadLike[]; mood: MoodLike[]; weekStart: string; weekEnd: string }) {
  const inWeek = (d?: string) => !!d && d.slice(0, 10) >= input.weekStart && d.slice(0, 10) <= input.weekEnd;
  const tasks = input.tasks.filter((t) => inWeek(t.created_at) || inWeek(t.due_date || undefined));
  const study = input.study.filter((s) => inWeek(s.created_at));
  const workload = input.workload.filter((w) => inWeek(w.created_at));
  const mood = input.mood.filter((m) => inWeek(m.created_at));
  const comp = taskCompletion(tasks);
  const studyMinutes = study.reduce((s, x) => s + (Number(x.duration_minutes) || 0), 0);
  const wl = workloadSummary(workload);
  const mt = moodTrend(mood);
  return {
    weekStart: input.weekStart, weekEnd: input.weekEnd,
    tasksCompleted: comp.done, tasksTotal: comp.total, completionPct: comp.pct,
    studyMinutes, studySessions: study.length,
    workloadHours: wl.totalHours, workloadLevel: wl.level,
    avgMood: mt.avgMood, avgStress: mt.avgStress,
    suggestion: stressSuggestion(mt.avgStress),
  };
}
export interface MemoryLike {
  title: string;
  content: string;
  category?: string | null;
  created_at?: string;
}

/**
 * Keyword search over a user's memories. Pure and testable.
 * Scoring: title match > category match > content match; an exact-phrase
 * title match scores highest. Ties break by most recent first.
 * An empty query returns the input unchanged (recency order is the caller's).
 */
export function searchMemories<T extends MemoryLike>(memories: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return memories;
  const tokens = q.split(/\s+/).filter(Boolean);
  const scored: { item: T; score: number; time: number }[] = [];
  for (const item of memories) {
    const title = item.title.toLowerCase();
    const content = item.content.toLowerCase();
    const category = (item.category || "").toLowerCase();
    let score = 0;
    if (title.includes(q)) score += 20;
    if (content.includes(q)) score += 5;
    for (const token of tokens) {
      if (title.includes(token)) score += 10;
      if (category.includes(token)) score += 5;
      if (content.includes(token)) score += 3;
    }
    if (score <= 0) continue;
    const time = item.created_at ? Date.parse(item.created_at) : 0;
    scored.push({ item, score, time: Number.isFinite(time) ? time : 0 });
  }
  scored.sort((a, b) => b.score - a.score || b.time - a.time);
  return scored.map((s) => s.item);
}

/**
 * Select the memories relevant to a chat message, capped and truncated.
 * The caller must only pass the user's own *enabled* memories. Returns both
 * the selected items (for UI reporting) and the labelled context string the
 * server may include. Never returns the whole memory list unfiltered, and
 * never sends more than maxItems items or maxCharsPer characters each.
 */
export function formatMemoryContext<T extends MemoryLike>(
  memories: T[],
  query: string,
  maxItems = 5,
  maxCharsPer = 300
): { used: T[]; context: string } {
  const used = searchMemories(memories, query).slice(0, maxItems);
  if (!used.length) return { used: [], context: "" };
  const lines = used.map(
    (m) => `- ${m.title.slice(0, 100)}: ${m.content.slice(0, maxCharsPer)}`
  );
  return {
    used,
    context: `User-approved saved memories (use only if relevant; do not repeat them verbatim unless helpful):\n${lines.join("\n")}`,
  };
}

export function weekBounds(date: Date): { start: string; end: string } {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay(); const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  const start = d.toISOString().slice(0, 10);
  d.setUTCDate(d.getUTCDate() + 6);
  return { start, end: d.toISOString().slice(0, 10) };
}
