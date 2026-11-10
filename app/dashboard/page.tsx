"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell, Glass, EmptyState } from "@/components/ui";
import { useUser } from "@/lib/useUser";
import { taskCompletion, tasksDueToday, workloadSummary, moodTrend, type TaskLike } from "@/lib/logic";
import { pendingTasks } from "@/lib/pending";
import BreathingExercise from "@/components/BreathingExercise";

type StressApi = {
  score: number | null;
  level: string;
  factors: { key: string; label: string; weight: number; value: number | null; detail: string; missing: boolean }[];
  missing: string[];
  confidence: number;
  suggestions: string[];
  trend: { date: string; score: number | null }[];
  reading: string;
  readingSource: "gemini" | "keyword" | "none";
  disclaimer: string;
};

type WorkloadApi = {
  score: number | null;
  level: string;
  sources: { key: string; label: string; weight: number; value: number | null; detail: string; missing: boolean }[];
  missing: string[];
  confidence: number;
  daily: { date: string; score: number; tasksCreated: number; tasksCompleted: number; studyMinutes: number; messages: number }[];
  busiestDay: string | null;
  trend: { direction: "up" | "down" | "flat"; delta: number; thisWeekAvg: number; prevWeekAvg: number };
  signals: string[];
  report: string;
  reportSource: "gemini" | "template" | "none";
  generatedAt: string;
  windowLabel: string;
  disclaimer: string;
};

const LEVEL_COLOR: Record<string, string> = {
  Low: "#22c55e",
  Moderate: "#eab308",
  High: "#f97316",
  "Very high": "#ef4444",
  "no-data": "#6b7280",
};

export default function Page() {
  const { user, sb, loading } = useUser();
  const [data, setData] = useState<{ tasks: TaskLike[]; convs: { id: string; title: string }[]; mood: { mood_score: number; stress_score: number; created_at: string }[]; workload: { hours: number; intensity: number; created_at: string }[] } | null>(null);
  const [stress, setStress] = useState<StressApi | null>(null);
  const [stressErr, setStressErr] = useState("");
  const [workload, setWorkload] = useState<WorkloadApi | null>(null);
  const [workloadErr, setWorkloadErr] = useState("");
  const [workloadRefreshing, setWorkloadRefreshing] = useState(false);
  async function loadWorkload() {
    setWorkloadRefreshing(true);
    try {
      const res = await fetch("/api/workload");
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Workload report failed");
      setWorkload(d as WorkloadApi);
      setWorkloadErr("");
    } catch (e) { setWorkloadErr((e as Error).message); }
    finally { setWorkloadRefreshing(false); }
  }
  const [err, setErr] = useState("");
  useEffect(() => {
    if (!user || !sb) return;
    (async () => {
      const [t, c, m, w] = await Promise.all([sb.from("tasks").select("*").order("due_date", { ascending: true }), sb.from("conversations").select("id,title,created_at").order("created_at", { ascending: false }).limit(5), sb.from("mood_checkins").select("*").order("created_at", { ascending: false }).limit(14), sb.from("workload_entries").select("*").order("created_at", { ascending: false }).limit(30)]);
      if (t.error) setErr(t.error.message);
      setData({ tasks: (t.data || []) as TaskLike[], convs: (c.data || []) as { id: string; title: string }[], mood: (m.data || []) as never, workload: (w.data || []) as never });
    })();
    (async () => {
      try {
        const res = await fetch("/api/stress");
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || "Stress score failed");
        setStress(d as StressApi);
      } catch (e) { setStressErr((e as Error).message); }
    })();
    loadWorkload();
  }, [user, sb]);
  const today = new Date().toISOString().slice(0, 10);
  const color = stress ? LEVEL_COLOR[stress.level] || "#6b7280" : "#6b7280";
  return <AppShell title="Your stress score">
    {loading && <p className="muted">Loading…</p>}
    {!loading && !user && <Glass><EmptyState text="Sign in to see your personal stress score. It is computed only from your own records — nothing is shared." /><p><Link className="btn" href="/login">Log in</Link></p></Glass>}
    {err && <p className="error" role="alert">{err}</p>}
    {user && (
      <>
        {/* Stress calculator — the main goal of EDITH. */}
        <Glass>
          <h2 style={{ marginTop: 0 }}>How stressed am I right now — and why?</h2>
          {stressErr && <p className="error" role="alert">{stressErr}</p>}
          {!stress && !stressErr && <p className="muted">Calculating your stress estimate…</p>}
          {stress && stress.score === null && (
            <>
              <EmptyState text="No data yet — your first stress estimate will appear once you log a mood check-in, some workload, tasks, study, or chat with EDITH." />
              <p style={{ display: "flex", gap: ".5rem", flexWrap: "wrap" }}><Link className="btn" href="/mood">Add a mood check-in →</Link><Link className="btn btn-secondary" href="/chat">Chat with EDITH →</Link></p>
            </>
          )}
          {stress && stress.score !== null && (
            <>
              <div style={{ display: "flex", gap: "1.5rem", alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ textAlign: "center", minWidth: 140 }}>
                  <div style={{ fontSize: "3.2rem", fontWeight: 800, lineHeight: 1, color }}>{stress.score}<span style={{ fontSize: "1.2rem", color: "var(--text-muted)" }}>/100</span></div>
                  <p style={{ margin: ".3rem 0 0", fontWeight: 700, color }}>{stress.level} stress</p>
                </div>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <div aria-label={`Stress score ${stress.score} out of 100, ${stress.level}`} role="img" style={{ height: 18, borderRadius: 999, background: "rgba(127,127,127,.25)", overflow: "hidden" }}>
                    <div style={{ width: `${stress.score}%`, height: "100%", background: color, borderRadius: 999 }} />
                  </div>
                  <p className="muted" style={{ fontSize: ".85rem", marginTop: ".5rem" }}>
                    Based on {stress.factors.filter((f) => !f.missing).length} of {stress.factors.length} inputs in the last 7 days
                    {stress.missing.length ? ` — missing: ${stress.missing.join(", ")}` : ""}. {stress.disclaimer}
                  </p>
                </div>
              </div>

              <h3>What is driving it</h3>
              <ul style={{ listStyle: "none", padding: 0 }}>
                {stress.factors.map((f) => (
                  <li key={f.key} style={{ marginTop: ".5rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: ".5rem", flexWrap: "wrap" }}>
                      <strong>{f.label}</strong>
                      <span className="muted">{f.missing ? "no data" : `${f.value}/100 · weight ${f.weight}%`}</span>
                    </div>
                    {!f.missing && f.value !== null && (
                      <div aria-hidden="true" style={{ height: 8, borderRadius: 999, background: "rgba(127,127,127,.25)", overflow: "hidden", marginTop: ".2rem" }}>
                        <div style={{ width: `${f.value}%`, height: "100%", background: color }} />
                      </div>
                    )}
                    <p className="muted" style={{ fontSize: ".85rem", margin: ".2rem 0 0" }}>{f.detail}</p>
                  </li>
                ))}
              </ul>

              {stress.trend.some((d) => d.score !== null) && (
                <>
                  <h3>Last 7 days</h3>
                  <div style={{ display: "flex", gap: ".4rem", alignItems: "flex-end", height: 90 }} aria-label="Daily stress scores for the last 7 days">
                    {stress.trend.map((d) => (
                      <div key={d.date} style={{ flex: 1, textAlign: "center" }}>
                        <div title={`${d.date}: ${d.score ?? "no data"}`} style={{ height: d.score === null ? 4 : Math.max(6, d.score * 0.8), background: d.score === null ? "rgba(127,127,127,.3)" : color, borderRadius: 4, margin: "0 auto" }} />
                        <div className="muted" style={{ fontSize: ".7rem", marginTop: ".2rem" }}>{d.date.slice(5)}</div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {stress.reading && (
                <p style={{ marginTop: "1rem" }}><strong>Mood reading{stress.readingSource === "gemini" ? " (AI)" : stress.readingSource === "keyword" ? " (from your words)" : ""}:</strong> {stress.reading}</p>
              )}

              <h3>What may help</h3>
              <ul>{stress.suggestions.map((s, i) => <li key={i}>{s}</li>)}</ul>
              {(stress.level === "High" || stress.level === "Very high") && (
                <>
                  <h3>Take 2 minutes to breathe</h3>
                  <p className="muted" style={{ fontSize: ".9rem" }}>Your stress is {stress.level.toLowerCase()} right now — a short box-breathing exercise can help you slow down before the next task.</p>
                  <BreathingExercise />
                </>
              )}
              <p className="muted" style={{ fontSize: ".85rem" }}>These are general, non-clinical suggestions tied to your biggest factors — not medical advice. If stress keeps feeling high, consider talking to someone you trust or a professional.</p>
            </>
          )}
          <p style={{ display: "flex", gap: ".5rem", flexWrap: "wrap", marginTop: "1rem" }}>
            <Link className="btn btn-secondary" href="/mood">Mood check-in →</Link>
            <Link className="btn btn-secondary" href="/workload">Log workload →</Link>
            <Link className="btn btn-secondary" href="/tasks">Tasks (supporting) →</Link>
            <Link className="btn btn-secondary" href="/study">Study (supporting) →</Link>
          </p>
        </Glass>

        {/* Today — what to start, where, and when (from the Tasks planner). */}
        <Glass>
          <h2 style={{ marginTop: 0 }}>Today — what to start, where, and when</h2>
          {(() => {
            type TodayTask = TaskLike & { start_time?: string | null; planned_minutes?: number | null; place?: string | null; reminder_at?: string | null };
            const list = (data?.tasks || []) as TodayTask[];
            const todays = list.filter((t) => t.status !== "done" && ((t.due_date && t.due_date.slice(0, 10) === today) || (t.start_time && t.start_time.slice(0, 10) === today)));
            const dueReminders = list.filter((t) => t.status !== "done" && t.reminder_at && Date.parse(t.reminder_at) <= Date.now() + 24 * 60 * 60 * 1000);
            const pending = pendingTasks(list.map((t) => ({ id: (t as { id?: string }).id || "", title: (t as { title?: string }).title || "Task", status: t.status, start_time: t.start_time, due_date: t.due_date, place: t.place })));
            if (!todays.length && !dueReminders.length && !pending.length) return <EmptyState text="Nothing planned for today — add a task with a start time, place and reminder on the Tasks page." />;
            return (<>
              {pending.length > 0 && (<>
                <h3 style={{ marginTop: 0 }}>⚠️ Pending — you haven't done this yet</h3>
                <ul style={{ listStyle: "none", padding: 0 }}>
                  {pending.map((t) => (
                    <li key={t.id} style={{ marginBottom: ".5rem" }}>
                      <strong>{t.title}</strong>
                      <span className="muted"> · was due to start {t.start_time ? new Date(t.start_time).toLocaleString() : t.due_date ? `on ${t.due_date}` : ""}{t.place ? ` · ${t.place}` : ""}</span>
                      {" "}<Link className="btn btn-secondary" href={`/study?task=${t.id}`}>Start now →</Link>
                    </li>
                  ))}
                </ul>
              </>)}
              {todays.length > 0 && (<>
                <h3 style={{ marginTop: 0 }}>Today's tasks</h3>
                <ul style={{ listStyle: "none", padding: 0 }}>
                  {todays.map((t, i) => (
                    <li key={i} style={{ marginBottom: ".5rem" }}>
                      <strong>{(t as { title?: string }).title || "Task"}</strong>
                      <span className="muted"> · {t.start_time ? `starts ${new Date(t.start_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : t.due_date ? `due today` : ""}{t.place ? ` · ${t.place}` : ""}{t.planned_minutes ? ` · ${t.planned_minutes} min planned` : ""}</span>
                    </li>
                  ))}
                </ul>
              </>)}
              {dueReminders.length > 0 && (<>
                <h3>Reminders due</h3>
                <ul style={{ listStyle: "none", padding: 0 }}>
                  {dueReminders.map((t, i) => (
                    <li key={i} style={{ marginBottom: ".5rem" }}>
                      ⏰ <strong>{(t as { title?: string }).title || "Task"}</strong>
                      <span className="muted"> · remind at {t.reminder_at ? new Date(t.reminder_at).toLocaleString() : ""}{t.place ? ` · ${t.place}` : ""}</span>
                    </li>
                  ))}
                </ul>
                <p className="muted" style={{ fontSize: ".85rem" }}>Reminders also pop up as a browser notification while the app is open (tap “Enable task reminders” at the bottom-right of any page).</p>
              </>)}
            </>);
          })()}
          <p style={{ display: "flex", gap: ".5rem", flexWrap: "wrap", marginTop: "1rem" }}>
            <Link className="btn btn-secondary" href="/tasks">Plan tasks →</Link>
            <Link className="btn btn-secondary" href="/study">Start studying →</Link>
          </p>
        </Glass>

        {/* Workload report — calculated by the app itself from your activity. */}
        <Glass>
          <h2 style={{ marginTop: 0 }}>Your workload this week — worked out by the app</h2>
          <p className="muted" style={{ fontSize: ".9rem" }}>
            No typing needed: this is calculated automatically from your tasks, study sessions, chats and mood check-ins in the last 7 days.
          </p>
          {workloadErr && <p className="error" role="alert">{workloadErr}</p>}
          {!workload && !workloadErr && <p className="muted">Calculating your workload report…</p>}
          {workload && workload.score === null && (
            <EmptyState text="No activity yet — chat, log tasks or study, and your first workload report will appear here." />
          )}
          {workload && workload.score !== null && (
            <>
              <div style={{ display: "flex", gap: "1.5rem", alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ textAlign: "center", minWidth: 140 }}>
                  <div style={{ fontSize: "3.2rem", fontWeight: 800, lineHeight: 1, color: LEVEL_COLOR[workload.level] || "#6b7280" }}>{workload.score}<span style={{ fontSize: "1.2rem", color: "var(--text-muted)" }}>/100</span></div>
                  <p style={{ margin: ".3rem 0 0", fontWeight: 700, color: LEVEL_COLOR[workload.level] || "#6b7280" }}>{workload.level} workload</p>
                  <p className="muted" style={{ fontSize: ".85rem", margin: ".3rem 0 0" }}>
                    {workload.trend.direction === "flat"
                      ? "About the same as last week"
                      : workload.trend.direction === "up"
                        ? `↑ ${Math.abs(workload.trend.delta)} points busier than last week`
                        : `↓ ${Math.abs(workload.trend.delta)} points quieter than last week`}
                    {workload.busiestDay ? ` · busiest day ${workload.busiestDay}` : ""}
                  </p>
                </div>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <div aria-label={`Workload score ${workload.score} out of 100, ${workload.level}`} role="img" style={{ height: 18, borderRadius: 999, background: "rgba(127,127,127,.25)", overflow: "hidden" }}>
                    <div style={{ width: `${workload.score}%`, height: "100%", background: LEVEL_COLOR[workload.level] || "#6b7280", borderRadius: 999 }} />
                  </div>
                  <p className="muted" style={{ fontSize: ".85rem", marginTop: ".5rem" }}>
                    Based on {workload.sources.filter((f) => !f.missing).length} of {workload.sources.length} sources in the last 7 days
                    {workload.missing.length ? ` — missing: ${workload.missing.join(", ")}` : ""}. {workload.disclaimer}
                  </p>
                </div>
              </div>

              <h3>What is driving it</h3>
              <ul style={{ listStyle: "none", padding: 0 }}>
                {workload.sources.map((f) => (
                  <li key={f.key} style={{ marginTop: ".5rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: ".5rem", flexWrap: "wrap" }}>
                      <strong>{f.label}</strong>
                      <span className="muted">{f.missing ? "no data" : `${f.value}/100 · weight ${f.weight}%`}</span>
                    </div>
                    {!f.missing && f.value !== null && (
                      <div aria-hidden="true" style={{ height: 8, borderRadius: 999, background: "rgba(127,127,127,.25)", overflow: "hidden", marginTop: ".2rem" }}>
                        <div style={{ width: `${f.value}%`, height: "100%", background: LEVEL_COLOR[workload.level] || "#6b7280" }} />
                      </div>
                    )}
                    <p className="muted" style={{ fontSize: ".85rem", margin: ".2rem 0 0" }}>{f.detail}</p>
                  </li>
                ))}
              </ul>

              <h3>Last 7 days</h3>
              <div style={{ display: "flex", gap: ".4rem", alignItems: "flex-end", height: 90 }} aria-label="Daily workload scores for the last 7 days">
                {workload.daily.map((d) => (
                  <div key={d.date} style={{ flex: 1, textAlign: "center" }}>
                    <div title={`${d.date}: score ${d.score} — ${d.tasksCreated + d.tasksCompleted} tasks, ${d.studyMinutes} study minutes, ${d.messages} messages`} style={{ height: Math.max(4, d.score * 0.8), background: d.score === 0 ? "rgba(127,127,127,.3)" : LEVEL_COLOR[workload.level] || "#6b7280", borderRadius: 4, margin: "0 auto" }} />
                    <div className="muted" style={{ fontSize: ".7rem", marginTop: ".2rem" }}>{d.date.slice(5)}</div>
                  </div>
                ))}
              </div>

              {workload.signals.length > 0 && (
                <p style={{ marginTop: "1rem" }}><strong>Top signals:</strong> {workload.signals.join(" · ")}.</p>
              )}

              {workload.report && (
                <p style={{ marginTop: "1rem" }}><strong>Report{workload.reportSource === "gemini" ? " (AI)" : workload.reportSource === "template" ? " (from your activity)" : ""}:</strong> {workload.report}</p>
              )}
              <p className="muted" style={{ fontSize: ".85rem" }}>
                {workload.windowLabel}. Generated {workload.generatedAt ? new Date(workload.generatedAt).toLocaleString() : "just now"}.
              </p>
            </>
          )}
          <p style={{ display: "flex", gap: ".5rem", flexWrap: "wrap", marginTop: "1rem" }}>
            <button className="btn btn-secondary" onClick={loadWorkload} disabled={workloadRefreshing}>{workloadRefreshing ? "Refreshing…" : "↻ Refresh report"}</button>
            <Link className="btn btn-secondary" href="/workload">Workload log →</Link>
            <Link className="btn btn-secondary" href="/tasks">Tasks →</Link>
            <Link className="btn btn-secondary" href="/study">Study →</Link>
          </p>
        </Glass>

        {/* Supporting inputs — tasks and study are inputs, not the headline. */}
        {data && (() => { const comp = taskCompletion(data.tasks); const due = tasksDueToday(data.tasks, today); const wl = workloadSummary(data.workload); const mt = moodTrend(data.mood); return (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: "1rem", marginTop: "1rem" }}>
            <Glass><h3 style={{ marginTop: 0 }}>Tasks — a supporting input</h3>{due.length ? <ul>{due.map((t, i) => <li key={i}>{(t as { title?: string }).title || "Task"}</li>)}</ul> : <EmptyState text="No tasks due today." />}<p className="muted">{comp.done}/{comp.total} tasks complete ({comp.pct}%)</p><Link href="/tasks">Open tasks →</Link></Glass>
            <Glass><h3 style={{ marginTop: 0 }}>Workload — a supporting input</h3>{data.workload.length ? <><p>{wl.totalHours}h logged · average intensity {wl.avgIntensity}/10 · level: {wl.level}</p></> : <EmptyState text="No workload entries yet." />}<Link href="/workload">Log workload →</Link></Glass>
            <Glass><h3 style={{ marginTop: 0 }}>Mood & stress (self-reported)</h3>{mt.count ? <><p>Average mood {mt.avgMood}/10 · stress {mt.avgStress}/10</p></> : <EmptyState text="No check-ins yet." />}<Link href="/mood">Check in →</Link></Glass>
            <Glass><h3 style={{ marginTop: 0 }}>Recent conversations</h3>{data.convs.length ? <ul>{data.convs.map((c) => <li key={c.id}>{c.title}</li>)}</ul> : <EmptyState text="No conversations yet." />}<Link href="/chat">Chat with EDITH →</Link></Glass>
          </div>); })()}
      </>
    )}
  </AppShell>;
}
