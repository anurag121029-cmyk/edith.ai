import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { computeWorkloadAnalysis, templateWorkloadReport, WORKLOAD_DISCLAIMER } from "@/lib/workload";
import { geminiGenerate } from "@/lib/gemini";
import { chatLimiter, clientIpFromHeaders } from "@/lib/rateLimit";

/**
 * GET /api/workload — automatic workload report.
 * Workload is calculated by the app itself from the signed-in user's OWN
 * activity in the last 14 days (7 for the report, 7 more for the trend):
 * tasks, study sessions, their own chat messages, mood check-ins, and
 * manual workload entries when present. Owner-only: every query goes
 * through their Supabase client, so RLS returns nobody else's rows.
 *
 * The written report comes from Gemini when configured, from AGGREGATES
 * ONLY (counts, hours, scores, per-day totals) — raw message text is
 * never sent. When Gemini is unavailable, a deterministic template
 * report built from the same aggregates is used instead. The response
 * always labels which source produced the report, and the score is
 * always labelled as an estimate from app activity, never a diagnosis.
 */
export async function GET(req: Request) {
  const limit = chatLimiter.check(clientIpFromHeaders(req.headers));
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many requests. Please wait a moment and try again." }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });
  }
  try {
    const sb = await createServerSupabase();
    if (!sb) return NextResponse.json({ error: "Supabase is not configured on the server." }, { status: 503 });
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ error: "Sign in to see your workload report." }, { status: 401 });

    const [t, s, msgs, m, w] = await Promise.all([
      sb.from("tasks").select("status,priority,due_date,created_at,updated_at").order("created_at", { ascending: false }).limit(200),
      sb.from("study_sessions").select("duration_minutes,created_at").order("created_at", { ascending: false }).limit(100),
      sb.from("messages").select("content,created_at").eq("role", "user").order("created_at", { ascending: false }).limit(100),
      sb.from("mood_checkins").select("stress_score,created_at").order("created_at", { ascending: false }).limit(30),
      sb.from("workload_entries").select("hours,intensity,created_at").order("created_at", { ascending: false }).limit(50),
    ]);
    const analysis = computeWorkloadAnalysis({
      tasks: (t.data || []) as never,
      study: (s.data || []) as never,
      messages: (msgs.data || []) as never,
      mood: (m.data || []) as never,
      workload: (w.data || []) as never,
    });

    // Written report: Gemini from aggregates only, template fallback.
    let report = "";
    let reportSource: "gemini" | "template" | "none" = "none";
    if (analysis.score !== null) {
      const agg = [
        `workload score ${analysis.score}/100 (${analysis.level})`,
        `trend ${analysis.trend.direction} (delta ${analysis.trend.delta}, this week avg ${analysis.trend.thisWeekAvg}, last week avg ${analysis.trend.prevWeekAvg})`,
        `busiest day ${analysis.busiestDay ?? "none"}`,
        `top signals: ${analysis.signals.join(", ") || "none"}`,
        `per-day scores: ${analysis.daily.map((d) => `${d.date}=${d.score}`).join(", ")}`,
        `sources present: ${analysis.sources.filter((x) => !x.missing).map((x) => `${x.label} ${x.value}/100`).join("; ")}`,
      ].join("\n");
      try {
        const { text } = await geminiGenerate([{
          text: `You are EDITH, a supportive personal assistant for non-clinical stress management. ` +
            `Write a short workload report (3 to 5 short sentences) from ONLY these aggregates about the user's own activity in the last 7 days. ` +
            `Say what drove the workload this week, name the busiest period, and give one practical suggestion. ` +
            `Never diagnose any medical or mental-health condition, never claim certainty, and never invent details beyond the aggregates.\n\n${agg}`,
        }]);
        if (text && text.trim()) { report = text.trim().slice(0, 900); reportSource = "gemini"; }
      } catch {
        /* Gemini unavailable — fall through to the template report. */
      }
      if (!report) {
        report = templateWorkloadReport(analysis);
        reportSource = "template";
      }
    } else {
      report = templateWorkloadReport(analysis);
      reportSource = "none";
    }

    return NextResponse.json({
      ...analysis,
      report,
      reportSource,
      generatedAt: new Date().toISOString(),
      windowLabel: "Generated from your activity in the last 7 days",
      disclaimer: WORKLOAD_DISCLAIMER,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || "Workload report failed" }, { status: 500 });
  }
}
