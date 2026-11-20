import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { computePatterns, resolveTimeZone, PATTERNS_DISCLAIMER } from "@/lib/patterns";
import { geminiGenerate } from "@/lib/gemini";
import { chatLimiter, clientIpFromHeaders } from "@/lib/rateLimit";

/**
 * GET /api/patterns — daily understanding.
 * Works out the signed-in user's daily workload, activity patterns,
 * stress trends and wellbeing from their OWN last 28 days of activity
 * (tasks, study sessions, their own chat messages, mood check-ins,
 * manual workload entries). Owner-only: every query goes through their
 * Supabase client, so RLS returns nobody else's rows. Never invents
 * data — days with no activity stay null in the series.
 *
 * Today's row is best-effort upserted into daily_insights so the app
 * remembers what it learned; an upsert failure never fails the
 * response (the table may not exist yet if migration 0005 has not
 * been applied).
 *
 * The briefing is a deterministic template by default; when Gemini is
 * configured, a Gemini-written briefing from AGGREGATES ONLY (scores,
 * trends, counts, weekday names — never raw message text) is used
 * instead, with the template as fallback. The response always labels
 * which source produced the briefing, and every score is labelled as
 * an estimate from app activity, never a diagnosis.
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
    if (!user) return NextResponse.json({ error: "Sign in to see your patterns." }, { status: 401 });

    const [t, s, msgs, m, w] = await Promise.all([
      sb.from("tasks").select("status,priority,due_date,created_at,updated_at,title").order("created_at", { ascending: false }).limit(300),
      sb.from("study_sessions").select("duration_minutes,created_at").order("created_at", { ascending: false }).limit(200),
      sb.from("messages").select("content,created_at").eq("role", "user").order("created_at", { ascending: false }).limit(200),
      sb.from("mood_checkins").select("stress_score,mood_score,created_at").order("created_at", { ascending: false }).limit(100),
      sb.from("workload_entries").select("hours,intensity,created_at").order("created_at", { ascending: false }).limit(100),
    ]);
    // Busiest hours are shown in the viewer's timezone when the client
    // sends ?tz=<IANA name>; invalid values fall back to UTC.
    const timeZone = resolveTimeZone(new URL(req.url).searchParams.get("tz") || undefined);
    const result = computePatterns({
      tasks: (t.data || []) as never,
      study: (s.data || []) as never,
      messages: (msgs.data || []) as never,
      mood: (m.data || []) as never,
      workload: (w.data || []) as never,
      timeZone,
    });

    // Briefing: Gemini from aggregates only, template fallback.
    let briefing = result.briefing;
    let source: "gemini" | "template" | "none" = result.hasData ? "template" : "none";
    if (result.hasData) {
      const agg = [
        `wellbeing today ${result.wellbeing.today ?? "unknown"}/100, 7-day average ${result.wellbeing.average7 ?? "unknown"}`,
        `stress trend ${result.trends.stress.direction} (delta ${result.trends.stress.delta ?? "?"}, streak ${result.trends.stress.streak} days)`,
        `workload trend ${result.trends.workload.direction} (delta ${result.trends.workload.delta ?? "?"})`,
        `mood trend ${result.trends.mood.direction} (delta ${result.trends.mood.delta ?? "?"})`,
        `busiest hours ${result.patterns.busiestHours.map((h) => h.label).join(", ") || "unknown"}`,
        `hardest weekday ${result.patterns.hardestWeekday ?? "unknown"}, calmest weekday ${result.patterns.calmestWeekday ?? "unknown"}`,
        `most active weekday ${result.patterns.mostActiveWeekday ?? "unknown"}`,
        `low-activity days in the last 7: ${result.wellbeing.lowActivityDays}`,
        `open tasks due today: ${result.todayTasks.length}`,
        `alerts: ${result.alerts.map((a) => a.key).join(", ") || "none"}`,
      ].join("\n");
      try {
        const { text } = await geminiGenerate([{
          text: `You are EDITH, a supportive personal assistant for non-clinical stress management. ` +
            `Write a short "today" briefing (3 to 5 short sentences) from ONLY these aggregates about the user's own last 28 days of activity. ` +
            `Say what today usually looks like for this user, what to watch (trends, hardest weekday, workload change), and give one practical suggestion. ` +
            `Never diagnose any medical or mental-health condition, never claim certainty, and never invent details beyond the aggregates.\n\n${agg}`,
        }]);
        if (text && text.trim()) { briefing = text.trim().slice(0, 900); source = "gemini"; }
      } catch {
        /* Gemini unavailable — keep the template briefing. */
      }
    }

    // Remember today: best-effort upsert, never fails the response.
    try {
      await sb.from("daily_insights").upsert(
        {
          user_id: user.id,
          date: result.today.date,
          stress_score: result.today.stress,
          workload_score: result.today.workload,
          mood_score: result.today.mood,
          wellbeing_score: result.today.wellbeing,
          patterns: result.patterns,
          briefing,
        },
        { onConflict: "user_id,date" },
      );
    } catch {
      /* Table may not exist yet (migration 0005) — the response still stands. */
    }

    return NextResponse.json({
      today: result.today,
      series: result.series,
      trends: result.trends,
      patterns: result.patterns,
      wellbeing: result.wellbeing,
      alerts: result.alerts,
      briefing,
      source,
      hasData: result.hasData,
      generatedAt: new Date().toISOString(),
      windowLabel: "Learned from your activity in the last 28 days",
      disclaimer: PATTERNS_DISCLAIMER,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || "Patterns failed" }, { status: 500 });
  }
}
