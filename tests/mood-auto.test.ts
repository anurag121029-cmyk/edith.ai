import { describe, it, expect } from "vitest";
import { deriveMoodFromChats, confidenceLabel } from "../lib/moodAuto";

describe("deriveMoodFromChats (automatic mood from chat keywords)", () => {
  it("returns null when there are no messages — never invented", () => {
    expect(deriveMoodFromChats([])).toBeNull();
    expect(deriveMoodFromChats(["", "   "])).toBeNull();
  });

  it("neutral chats (no signal words) map to stress 5 / mood 6", () => {
    const out = deriveMoodFromChats(["I went to the shop today", "I need to finish the report"]);
    expect(out).not.toBeNull();
    expect(out!.stressScore).toBe(5);
    expect(out!.moodScore).toBe(6);
    expect(out!.stressHits).toBe(0);
    expect(out!.calmHits).toBe(0);
    expect(out!.sampleCount).toBe(2);
    expect(out!.source).toBe("keyword");
  });

  it("strained chats map to high stress / low mood", () => {
    const out = deriveMoodFromChats([
      "I am so stressed and overwhelmed by the deadline",
      "I feel anxious and exhausted, I cannot cope",
    ]);
    expect(out).not.toBeNull();
    // stress words present: stressed, stress, overwhelmed, deadline,
    // anxious, exhausted, cannot cope → chat score clamps at 100.
    expect(out!.stressScore).toBe(10);
    expect(out!.moodScore).toBe(1);
    expect(out!.stressHits).toBeGreaterThan(0);
  });

  it("calm chats map to low stress / high mood", () => {
    const out = deriveMoodFromChats([
      "I feel calm and relaxed today",
      "I slept well and feel rested and happy",
    ]);
    expect(out).not.toBeNull();
    // calm words present: calm, relaxed, slept well, rested, happy
    // (and "good" is not in the text) → chat score 0.
    expect(out!.stressScore).toBe(1);
    expect(out!.moodScore).toBe(10);
    expect(out!.calmHits).toBeGreaterThan(0);
  });

  it("a single strained word still moves the score, with low confidence", () => {
    const out = deriveMoodFromChats(["I am stressed"]);
    expect(out).not.toBeNull();
    // "stressed" and "stress" both match → chat score 70.
    expect(out!.stressScore).toBe(7);
    expect(out!.moodScore).toBe(4);
    expect(out!.confidence).toBeLessThan(0.35);
    expect(out!.confidenceLabel).toBe("Low");
  });

  it("confidence grows with more messages and more signal words", () => {
    const few = deriveMoodFromChats(["I feel calm"]);
    const many = deriveMoodFromChats([
      "I feel calm and relaxed",
      "I slept well and feel rested",
      "I am happy and content today",
      "Everything feels manageable and balanced",
      "I feel proud and confident",
      "I am relieved and at peace",
      "I feel good and energised",
      "I am in control of my work",
      "I feel motivated and rested",
      "Today was great and peaceful",
    ]);
    expect(few).not.toBeNull();
    expect(many).not.toBeNull();
    expect(many!.confidence).toBeGreaterThan(few!.confidence);
    expect(many!.confidence).toBeGreaterThanOrEqual(0.7);
    expect(many!.confidenceLabel).toBe("High");
  });

  it("mood + stress always sum to 11 and stay in 1–10", () => {
    const cases = [
      ["I am stressed"],
      ["I feel calm"],
      ["deadline pressure and panic, I am exhausted"],
      ["hello"],
    ];
    for (const texts of cases) {
      const out = deriveMoodFromChats(texts);
      expect(out).not.toBeNull();
      expect(out!.moodScore + out!.stressScore).toBe(11);
      expect(out!.moodScore).toBeGreaterThanOrEqual(1);
      expect(out!.moodScore).toBeLessThanOrEqual(10);
      expect(out!.stressScore).toBeGreaterThanOrEqual(1);
      expect(out!.stressScore).toBeLessThanOrEqual(10);
    }
  });

  it("confidenceLabel bands", () => {
    expect(confidenceLabel(0)).toBe("Low");
    expect(confidenceLabel(0.34)).toBe("Low");
    expect(confidenceLabel(0.35)).toBe("Medium");
    expect(confidenceLabel(0.69)).toBe("Medium");
    expect(confidenceLabel(0.7)).toBe("High");
    expect(confidenceLabel(1)).toBe("High");
  });
});
