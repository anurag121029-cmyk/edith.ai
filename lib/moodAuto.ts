/**
 * Automatic mood reading — derived from the user's own recent chats.
 *
 * EDITH already reads chat mood by keyword as one factor of the stress
 * score (lib/stress.ts `chatMoodScore`). This module turns that same
 * keyword reading into a mood/stress pair (1–10 each) so the mood
 * check-in and the stress score keep working even when the user has
 * not logged a manual check-in — with a confidence that says how much
 * the reading is worth.
 *
 * Mapping (explicit, documented — the chat score is 0–100, 50 neutral):
 *
 *   stressScore = round(chatScore / 10), clamped to 1–10
 *   moodScore   = 11 − stressScore        (so a high stress reads as a
 *                                          low mood, and vice versa)
 *
 *   chatScore 50 (neutral) → stress 5, mood 6
 *   chatScore 0  (all calm) → stress 1, mood 10
 *   chatScore 100 (all strain) → stress 10, mood 1
 *
 * Confidence (0–1) is half how many messages were read and half how
 * much signal they contained, so a reading from one short message with
 * no signal words is honestly labelled Low:
 *
 *   messagePart = min(sampleCount, 10) / 10
 *   signalPart  = min(stressHits + calmHits, 6) / 6
 *   confidence  = round(0.5 × messagePart + 0.5 × signalPart, 2)
 *
 *   < 0.35 → "Low", < 0.70 → "Medium", otherwise "High"
 *
 * No messages → null (never invented). A manual check-in always wins
 * over this reading in the stress score — see app/api/stress/route.ts.
 * This is an ESTIMATE from the user's own words, not a diagnosis.
 */
import { chatMoodScore } from "./stress";

export interface AutoMood {
  moodScore: number;
  stressScore: number;
  /** 0–1, two decimals. */
  confidence: number;
  confidenceLabel: "Low" | "Medium" | "High";
  sampleCount: number;
  stressHits: number;
  calmHits: number;
  source: "keyword";
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

export function confidenceLabel(confidence: number): AutoMood["confidenceLabel"] {
  if (confidence < 0.35) return "Low";
  if (confidence < 0.7) return "Medium";
  return "High";
}

/**
 * Derive a mood/stress pair from recent user chat messages.
 * Returns null when there are no messages to read from.
 */
export function deriveMoodFromChats(chatTexts: string[]): AutoMood | null {
  const texts = (chatTexts || []).filter((t) => t && t.trim());
  if (!texts.length) return null;
  const { score, stressHits, calmHits, sampleCount } = chatMoodScore(texts);
  const stressScore = clamp(Math.round(score / 10), 1, 10);
  const moodScore = clamp(11 - stressScore, 1, 10);
  const messagePart = Math.min(sampleCount, 10) / 10;
  const signalPart = Math.min(stressHits + calmHits, 6) / 6;
  const confidence = Math.round((0.5 * messagePart + 0.5 * signalPart) * 100) / 100;
  return {
    moodScore,
    stressScore,
    confidence,
    confidenceLabel: confidenceLabel(confidence),
    sampleCount,
    stressHits,
    calmHits,
    source: "keyword",
  };
}
