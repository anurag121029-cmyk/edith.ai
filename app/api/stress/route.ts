import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { computeStressScore, computeDailyTrend, STRESS_DISCLAIMER, type StressInputs } from "@/lib/stress";
import { geminiGenerate } from "@/lib/gemini";
import { chatLimiter, clientIpFromHeaders } from "@/lib/rateLimit";

/**
 * GET /api/stress — the stress calculator.
 * Computes the deterministic score from the signed-in user's OWN recent
 * data only (owner-only: every query goes through their Supabase client,
 * so RLS returns nobody else's rows). Never invents data.
 *
 * Optionally asks Gemini for a short mood reading from recent chat text
 * when a key is configured; otherwise a keyword-based reading is used.
 * The response always labels which one produced the reading, and the
 * score is always labelled as an estimate, never a diagnosis.
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
    if (!user) return NextResponse.json({ error: "Sign in to see your stress score." }, { status: 401 });

    const [m, w, t, s, msgs] = await Promise.all([
      sb.from("mood_checkins").select("stress_score,created_at").order("created_at", { ascending: false }).limit(30),
      sb.from("workload_entries").select("hours,intensity,created_at").order("created_at", { ascending: false }).limit(50),
      sb.from("tasks").select("status,priority,due_date,created_at").order("created_at", { ascending: false }).limit(200),
      sb.from("study_sessions").select("duration_minutes,created_at").order("created_at", { ascending: false }).limit(50),
      sb.from("messages").select("content,created_at").eq("role", "user").order("created_at", { ascending: false }).limit(30),
    ]);
    const input: StressInputs = {
      mood: (m.data || []) as never,
      workload: (w.data || []) as never,
      tasks: (t.data || []) as never,
      study: (s.data || []) as never,
      chatTexts: ((msgs.data || []) as { content: string }[]).map((x) => x.content),
    };
    const result = computeStressScore(input);
    const trend = computeDailyTrend(input, 7);

    // Mood reading: Gemini when configured, keyword fallback otherwise.
    const chatTexts = input.chatTexts.filter(Boolean);
    let reading = "";
    let readingSource: "gemini" | "keyword" | "none" = "none";
    if (chatTexts.length) {
      const excerpt = chatTexts.slice(0, 10).join("\n").slice(0, 1500);
      try {
        const { text } = await geminiGenerate([{
          text: `You are EDITH, a supportive personal assistant for non-clinical stress management. ` +
            `The user has a stress estimate of ${result.score ?? "unknown"}/100 (${result.level}) from their own data. ` +
            `Based ONLY on these recent messages from the user, write one or two short, supportive sentences about how they seem to be feeling and one small practical step. ` +
            `Never diagnose any medical or mental-health condition, never claim certainty, and do not repeat the messages back.\n\nMessages:\n${excerpt}`,
        }]);
        if (text && text.trim()) { reading = text.trim().slice(0, 600); readingSource = "gemini"; }
      } catch {
        /* Gemini unavailable — fall through to the keyword reading. */
      }
      if (!reading) {
        const top = result.factors.find((f) => f.key === "chat");
        reading = top && top.value !== null
          ? (top.value >= 60
            ? "Your recent chats sound strained — lots of pressure and worry in your words. A short break and one small next step may help."
            : top.value <= 40
              ? "Your recent chats sound fairly settled — more calm words than stressed ones."
              : "Your recent chats are mixed — some pressure in your words, but nothing overwhelming.")
          : "Not enough recent chats to read your mood from.";
        readingSource = "keyword";
      }
    }

    return NextResponse.json({
      ...result,
      trend,
      reading,
      readingSource,
      disclaimer: STRESS_DISCLAIMER,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || "Stress score failed" }, { status: 500 });
  }
}
