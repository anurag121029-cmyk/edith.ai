import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { computeMoodPatterns, templateMoodSummary } from "@/lib/moodPatterns";
import { geminiGenerate } from "@/lib/gemini";
import { moodLimiter, clientIpFromHeaders } from "@/lib/rateLimit";

/**
 * GET /api/mood/summary — AI-generated mood summary + mood patterns.
 * Works out the signed-in user's OWN mood patterns from the last 28
 * days (average mood, trend, best/worst weekday, check-ins, streak,
 * and the mood × workload correlation) and asks Gemini to write a
 * short summary from those AGGREGATES ONLY — never raw notes, never
 * journal content, never raw message text. Journal entries are not
 * even read by this route. When Gemini is unavailable, a
 * deterministic template summary built from the same aggregates is
 * used instead. The response always labels which source produced the
 * summary, and every score is labelled as an estimate from
 * self-reported data, never a diagnosis.
 */
export async function GET(req: Request) {
  const limit = moodLimiter.check(clientIpFromHeaders(req.headers));
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many requests. Please wait a moment and try again." }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });
  }
  try {
    const sb = await createServerSupabase();
    if (!sb) return NextResponse.json({ error: "Supabase is not configured on the server." }, { status: 503 });
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ error: "Sign in to see your mood summary." }, { status: 401 });

    const twentyEightDaysAgo = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString();
    const [m, t, s, msgs] = await Promise.all([
      sb.from("mood_checkins").select("mood_score,stress_score,created_at").gte("created_at", twentyEightDaysAgo).order("created_at", { ascending: false }).limit(200),
      sb.from("tasks").select("status,created_at,updated_at").order("created_at", { ascending: false }).limit(200),
      sb.from("study_sessions").select("duration_minutes,created_at").order("created_at", { ascending: false }).limit(100),
      sb.from("messages").select("content,created_at").eq("role", "user").order("created_at", { ascending: false }).limit(100),
    ]);
    const analysis = computeMoodPatterns({
      mood: (m.data || []) as never,
      tasks: (t.data || []) as never,
      study: (s.data || []) as never,
      messages: (msgs.data || []) as never,
      workload: [],
    });

    // Written summary: Gemini from aggregates only, template fallback.
    let summary = "";
    let source: "gemini" | "template" | "none" = "none";
    if (analysis.hasData) {
      const agg = [
        `average mood ${analysis.averageMood}/10 over the last 28 days`,
        `${analysis.checkins28} check-ins on ${analysis.daysCheckedIn} of the last 28 days (consistency ${Math.round(analysis.consistency * 100)}%)`,
        `check-in streak ${analysis.checkinStreak} days`,
        `mood trend ${analysis.trend.direction} (delta ${analysis.trend.delta ?? "?"}, streak ${analysis.trend.streak} days, volatility ${analysis.trend.volatility ?? "?"})`,
        `best weekday ${analysis.bestWeekday ?? "unknown"} (avg mood ${analysis.bestWeekdayMood ?? "?"}/10), worst weekday ${analysis.worstWeekday ?? "unknown"} (avg mood ${analysis.worstWeekdayMood ?? "?"}/10)`,
        `mood range ${analysis.moodRange.min ?? "?"}–${analysis.moodRange.max ?? "?"} (1–10)`,
        analysis.correlation.key === "insufficient"
          ? `mood-workload correlation: not enough overlapping days (${analysis.correlation.days} days with both)`
          : `mood-workload correlation r = ${analysis.correlation.r} over ${analysis.correlation.days} overlapping days`,
      ].join("\n");
      try {
        const { text } = await geminiGenerate([{
          text: `You are EDITH, a supportive personal assistant for non-clinical stress management. ` +
            `Write a short mood summary (3 to 5 short sentences) from ONLY these aggregates about the user's own mood in the last 28 days. ` +
            `Say how their mood has been trending, name the best and hardest weekday, mention the check-in habit, and — only if a correlation value is given — one sentence about the mood-workload link, including that correlation is not causation. ` +
            `Never diagnose any medical or mental-health condition, never claim certainty, and never invent details beyond the aggregates.\n\n${agg}`,
        }]);
        if (text && text.trim()) { summary = text.trim().slice(0, 900); source = "gemini"; }
      } catch {
        /* Gemini unavailable — fall through to the template summary. */
      }
      if (!summary) {
        summary = templateMoodSummary(analysis);
        source = "template";
      }
    } else {
      summary = templateMoodSummary(analysis);
      source = "none";
    }

    return NextResponse.json({
      summary,
      source,
      patterns: analysis,
      generatedAt: new Date().toISOString(),
      windowLabel: "Learned from your mood check-ins in the last 28 days",
      disclaimer: analysis.disclaimer,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || "Mood summary failed" }, { status: 500 });
  }
}
