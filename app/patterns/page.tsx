"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell, Glass, EmptyState } from "@/components/ui";
import { useUser } from "@/lib/useUser";

type PatternsApi = {
  today: { date: string; stress: number | null; workload: number | null; mood: number | null; wellbeing: number | null };
  series: { date: string; stress: number | null; workload: number | null; mood: number | null; wellbeing: number | null }[];
  trends: { stress: { direction: string; delta: number | null; streak: number; volatility: number | null; thisWeekAvg: number | null; prevWeekAvg: number | null }; workload: { direction: string; delta: number | null; streak: number; volatility: number | null; thisWeekAvg: number | null; prevWeekAvg: number | null }; mood: { direction: string; delta: number | null; streak: number; volatility: number | null; thisWeekAvg: number | null; prevWeekAvg: number | null } };
  patterns: { busiestHours: { hour: number; label: string; count: number }[]; timeZone: string; hardestWeekday: string | null; hardestWeekdayLoad: number | null; calmestWeekday: string | null; calmestWeekdayLoad: number | null; mostActiveWeekday: string | null; mostActiveWeekdayCount: number };
  wellbeing: { today: number | null; average7: number | null; components: { key: string; label: string; weight: number; value: number | null; detail: string; missing: boolean }[]; lowActivityDays: number; lowActivityStreak: number };
  alerts: { key: string; kind: "warning" | "info" | "positive"; text: string }[];
  briefing: string;
  source: "gemini" | "template" | "none";
  hasData: boolean;
  windowLabel: string;
  disclaimer: string;
};

const TREND_ARROW: Record<string, string> = { rising: "↑", falling: "↓", flat: "→" };
const ALERT_COLOR: Record<string, string> = { warning: "#f97316", info: "#3b82f6", positive: "#22c55e" };

function trendSentence(name: string, t: PatternsApi["trends"]["stress"]): string {
  if (t.delta === null) return `${name}: not enough data to compare weeks.`;
  const dir = t.direction === "flat" ? "about the same as last week" : `${t.direction} ${Math.abs(t.delta)} points vs last week`;
  const streak = t.streak >= 2 ? ` · ${t.streak}-day streak` : "";
  const vol = t.volatility !== null ? ` · volatility ${t.volatility}` : "";
  return `${name}: ${dir}${streak}${vol}.`;
}

export default function Page() {
  const { user, loading } = useUser();
  const [data, setData] = useState<PatternsApi | null>(null);
  const [err, setErr] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  async function load() {
    setRefreshing(true);
    try {
      const tz = encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
      const res = await fetch(`/api/patterns?tz=${tz}`);
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Patterns failed");
      setData(d as PatternsApi);
      setErr("");
    } catch (e) { setErr((e as Error).message); }
    finally { setRefreshing(false); }
  }
  useEffect(() => { if (user) load(); /* eslint-disable-next-line */ }, [user]);

  return <AppShell title="Your patterns">
    {loading && <p className="muted">Loading…</p>}
    {!loading && !user && <Glass><EmptyState text="Sign in to see what EDITH has learned about your days. It is computed only from your own records — nothing is shared." /><p><Link className="btn" href="/login">Log in</Link></p></Glass>}
    {err && <p className="error" role="alert">{err}</p>}
    {user && !data && !err && <p className="muted">Learning your patterns…</p>}
    {user && data && !data.hasData && (
      <Glass>
        <EmptyState text="No activity yet — chat, log tasks or study, and EDITH will start learning what your days usually look like: your busiest hours, your hardest weekday, and how your stress trends." />
        <p style={{ display: "flex", gap: ".5rem", flexWrap: "wrap" }}><Link className="btn" href="/chat">Chat with EDITH →</Link><Link className="btn btn-secondary" href="/tasks">Add a task →</Link><Link className="btn btn-secondary" href="/mood">Add a mood check-in →</Link></p>
        <p className="muted" style={{ fontSize: ".85rem" }}>{data.disclaimer}</p>
      </Glass>
    )}
    {user && data && data.hasData && (
      <>
        {/* Today's wellbeing + briefing */}
        <Glass>
          <h2 style={{ marginTop: 0 }}>Today, understood</h2>
          {data.wellbeing.today !== null ? (
            <div style={{ display: "flex", gap: "1.5rem", alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ textAlign: "center", minWidth: 140 }}>
                <div style={{ fontSize: "3.2rem", fontWeight: 800, lineHeight: 1 }}>{data.wellbeing.today}<span style={{ fontSize: "1.2rem", color: "var(--text-muted)" }}>/100</span></div>
                <p style={{ margin: ".3rem 0 0", fontWeight: 700 }}>wellbeing today</p>
                <p className="muted" style={{ fontSize: ".85rem", margin: ".3rem 0 0" }}>7-day average: {data.wellbeing.average7 ?? "—"}/100</p>
              </div>
              <div style={{ flex: 1, minWidth: 220 }}>
                <div aria-label={`Wellbeing score ${data.wellbeing.today} out of 100`} role="img" style={{ height: 18, borderRadius: 999, background: "rgba(127,127,127,.25)", overflow: "hidden" }}>
                  <div style={{ width: `${data.wellbeing.today}%`, height: "100%", background: "#22c55e", borderRadius: 999 }} />
                </div>
                <p className="muted" style={{ fontSize: ".85rem", marginTop: ".5rem" }}>{data.disclaimer}</p>
              </div>
            </div>
          ) : (
            <EmptyState text="No wellbeing estimate for today yet — a quick mood check-in or some activity would complete the picture." />
          )}
          <h3>What makes up today&apos;s wellbeing</h3>
          <ul style={{ listStyle: "none", padding: 0 }}>
            {data.wellbeing.components.map((c) => (
              <li key={c.key} style={{ marginTop: ".5rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: ".5rem", flexWrap: "wrap" }}>
                  <strong>{c.label}</strong>
                  <span className="muted">{c.missing ? "no data" : `${c.value}/100 · weight ${c.weight}%`}</span>
                </div>
                <p className="muted" style={{ fontSize: ".85rem", margin: ".2rem 0 0" }}>{c.detail}</p>
              </li>
            ))}
          </ul>
          <p className="muted" style={{ fontSize: ".85rem" }}>
            Recovery: {data.wellbeing.lowActivityDays} of the last 7 days were low-activity days
            {data.wellbeing.lowActivityStreak >= 2 ? ` (including a ${data.wellbeing.lowActivityStreak}-day quiet streak)` : ""}.
            A low-activity day is one with a workload score under 30.
          </p>
          {data.briefing && (
            <p style={{ marginTop: "1rem" }}><strong>Today&apos;s briefing{data.source === "gemini" ? " (AI)" : data.source === "template" ? " (from your patterns)" : ""}:</strong> {data.briefing}</p>
          )}
        </Glass>

        {/* Alerts */}
        {data.alerts.length > 0 && (
          <Glass>
            <h2 style={{ marginTop: 0 }}>Worth noticing</h2>
            <ul style={{ listStyle: "none", padding: 0 }}>
              {data.alerts.map((a) => (
                <li key={a.key} style={{ marginTop: ".5rem", borderLeft: `4px solid ${ALERT_COLOR[a.kind] || "#6b7280"}`, paddingLeft: ".6rem" }}>{a.text}</li>
              ))}
            </ul>
          </Glass>
        )}

        {/* 28-day chart */}
        <Glass>
          <h2 style={{ marginTop: 0 }}>Last 28 days — stress &amp; workload</h2>
          <p className="muted" style={{ fontSize: ".85rem" }}>
            <span style={{ color: "#f97316" }}>■</span> stress &nbsp; <span style={{ color: "#3b82f6" }}>■</span> workload &nbsp;·&nbsp; a missing bar means no data that day, not a zero.
          </p>
          <div style={{ display: "flex", gap: 3, alignItems: "flex-end", height: 110 }} aria-label="Daily stress and workload scores for the last 28 days">
            {data.series.map((d) => (
              <div key={d.date} style={{ flex: 1, display: "flex", gap: 2, alignItems: "flex-end", justifyContent: "center", height: "100%" }}>
                <div title={`${d.date}: stress ${d.stress ?? "no data"}`} style={{ width: "45%", height: d.stress === null ? 3 : Math.max(4, d.stress), background: d.stress === null ? "rgba(127,127,127,.25)" : "#f97316", borderRadius: 2 }} />
                <div title={`${d.date}: workload ${d.workload ?? "no data"}`} style={{ width: "45%", height: d.workload === null ? 3 : Math.max(4, d.workload), background: d.workload === null ? "rgba(127,127,127,.25)" : "#3b82f6", borderRadius: 2 }} />
              </div>
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }} className="muted">
            <span style={{ fontSize: ".75rem" }}>{data.series[0]?.date}</span>
            <span style={{ fontSize: ".75rem" }}>{data.series[data.series.length - 1]?.date}</span>
          </div>
        </Glass>

        {/* Trends */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: "1rem", marginTop: "1rem" }}>
          {(["stress", "workload", "mood"] as const).map((k) => {
            const t = data.trends[k];
            return (
              <Glass key={k}>
                <h3 style={{ marginTop: 0, textTransform: "capitalize" }}>{k} trend</h3>
                <p style={{ fontSize: "1.6rem", fontWeight: 800, margin: ".2rem 0" }}>{TREND_ARROW[t.direction] || "→"} {t.direction}</p>
                <p className="muted" style={{ fontSize: ".9rem" }}>{trendSentence(k, t)}</p>
                <p className="muted" style={{ fontSize: ".85rem" }}>
                  This week avg: {t.thisWeekAvg ?? "—"} · last week avg: {t.prevWeekAvg ?? "—"}
                </p>
              </Glass>
            );
          })}
        </div>

        {/* Your patterns */}
        <Glass>
          <h2 style={{ marginTop: 0 }}>Your patterns</h2>
          <ul>
            <li><strong>Busiest hours (your time):</strong> {data.patterns.busiestHours.length ? data.patterns.busiestHours.map((h) => `${h.label} (${h.count} activity)`).join(", ") : "not enough activity yet"}</li>
            <li><strong>Hardest weekday:</strong> {data.patterns.hardestWeekday ? `${data.patterns.hardestWeekday} (average load ${data.patterns.hardestWeekdayLoad}/100)` : "not enough data yet"}</li>
            <li><strong>Calmest weekday:</strong> {data.patterns.calmestWeekday ? `${data.patterns.calmestWeekday} (average load ${data.patterns.calmestWeekdayLoad}/100)` : "not enough data yet"}</li>
            <li><strong>Most active weekday:</strong> {data.patterns.mostActiveWeekday ? `${data.patterns.mostActiveWeekday} (${data.patterns.mostActiveWeekdayCount} activity)` : "not enough data yet"}</li>
          </ul>
          <p className="muted" style={{ fontSize: ".85rem" }}>{data.windowLabel}. {data.disclaimer}</p>
          <p style={{ display: "flex", gap: ".5rem", flexWrap: "wrap", marginTop: "1rem" }}>
            <button className="btn btn-secondary" onClick={load} disabled={refreshing}>{refreshing ? "Refreshing…" : "↻ Refresh patterns"}</button>
            <Link className="btn btn-secondary" href="/dashboard">Back to dashboard →</Link>
          </p>
        </Glass>
      </>
    )}
  </AppShell>;
}
