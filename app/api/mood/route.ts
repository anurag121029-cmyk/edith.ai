import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { deriveMoodFromChats } from "@/lib/moodAuto";
import { geminiGenerate } from "@/lib/gemini";
import { moodLimiter, clientIpFromHeaders } from "@/lib/rateLimit";

/**
 * GET /api/mood — the automatic mood reading.
 * Reads the signed-in user's OWN recent chats (user-role messages from
 * the last 7 days) and derives a mood/stress pair from their words
 * (lib/moodAuto — keyword-based, with a confidence that says how much
 * the reading is worth). Also returns the latest manual check-in, so
 * the client can show which one is driving the stress score.
 *
 * Optionally asks Gemini for a short mood reading from message excerpts
 * when a key is configured (same pattern as /api/stress — excerpts
 * sliced to 1500 chars, never the full history); otherwise the keyword
 * reading is used. The response always labels which one produced the
 * reading. Raw message text is never sent to the client — only the
 * derived scores and the short reading.
 * A manual check-in always wins over this reading in the stress score.
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
    if (!user) return NextResponse.json({ error: "Sign in to see your mood reading." }, { status: 401 });

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const [msgs, manual] = await Promise.all([
      sb.from("messages").select("content,created_at").eq("role", "user").gte("created_at", sevenDaysAgo).order("created_at", { ascending: false }).limit(30),
      sb.from("mood_checkins").select("mood_score,stress_score,created_at").gte("created_at", sevenDaysAgo).order("created_at", { ascending: false }).limit(30),
    ]);
    const chatTexts = ((msgs.data || []) as { content: string }[]).map((x) => x.content).filter(Boolean);
    const auto = deriveMoodFromChats(chatTexts);
    const manualRows = (manual.data || []) as { mood_score: number; stress_score: number; created_at: string }[];
    const manualLatest = manualRows.length ? manualRows[0] : null;

    let reading = "";
    let readingSource: "gemini" | "keyword" | "none" = "none";
    if (auto) {
      const excerpt = chatTexts.slice(0, 10).join("\n").slice(0, 1500);
      try {
        const { text } = await geminiGenerate([{
          text: `You are EDITH, a supportive personal assistant for non-clinical stress management. ` +
            `Based ONLY on these recent messages from the user, write one short, supportive sentence about how they seem to be feeling. ` +
            `Never diagnose any medical or mental-health condition, never claim certainty, and do not repeat the messages back.\n\nMessages:\n${excerpt}`,
        }]);
        if (text && text.trim()) { reading = text.trim().slice(0, 400); readingSource = "gemini"; }
      } catch {
        /* Gemini unavailable — fall through to the keyword reading. */
      }
      if (!reading) {
        reading = auto.stressScore >= 7
          ? "Your recent chats sound strained — lots of pressure and worry in your words."
          : auto.stressScore <= 3
            ? "Your recent chats sound fairly settled — more calm words than stressed ones."
            : "Your recent chats are mixed — some pressure in your words, but nothing overwhelming.";
        readingSource = "keyword";
      }
    }

    return NextResponse.json({
      auto,
      manualLatest,
      manualRecentCount: manualRows.length,
      reading,
      readingSource,
      updatedAt: new Date().toISOString(),
      disclaimer: "Estimate read from your own recent chats — not a medical diagnosis or clinical assessment.",
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || "Mood reading failed" }, { status: 500 });
  }
}
