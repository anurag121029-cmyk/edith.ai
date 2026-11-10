import { describe, it, expect, vi, afterEach } from "vitest";
import { generateImage, fetchPollinationsImage, pollinationsImageUrl } from "../lib/imageGeneration";

// The Gemini image quota on the current key is 0 (429 "limit: 0" on every
// image model), so /api/image tries Gemini first and falls back to the
// free Pollinations service, which needs no key. These tests mock fetch
// and route by URL: generativelanguage.googleapis.com = Gemini,
// image.pollinations.ai = the fallback.

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function geminiImageReply() {
  return {
    ok: true,
    json: async () => ({
      candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: "iVBOR" } }] } }],
    }),
  };
}
function geminiTextOnlyReply() {
  return {
    ok: true,
    json: async () => ({ candidates: [{ content: { parts: [{ text: "I cannot make that image." }] } }] }),
  };
}
function geminiErrReply(status: number) {
  return { ok: false, status, json: async () => ({}) };
}
function pollinationsReply() {
  return {
    ok: true,
    headers: { get: (name: string) => (name.toLowerCase() === "content-type" ? "image/jpeg" : null) },
    arrayBuffer: async () => PNG_BYTES.buffer,
  };
}
function pollinationsErrReply(status: number) {
  return { ok: false, status, headers: { get: () => null }, arrayBuffer: async () => new ArrayBuffer(0) };
}

describe("image generation race (Gemini vs Pollinations, first image wins)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("builds the exact Pollinations URL: encoded prompt, nologo", () => {
    expect(pollinationsImageUrl("a red cat")).toBe(
      "https://image.pollinations.ai/prompt/a%20red%20cat?nologo=true",
    );
  });

  it("Gemini 429 → Pollinations bytes are returned with source 'pollinations' and Gemini is not retried", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    const fetchImpl = vi.fn((url: string) => {
      if (url.includes("pollinations")) return Promise.resolve(pollinationsReply());
      return Promise.resolve(geminiErrReply(429));
    });
    vi.stubGlobal("fetch", fetchImpl);
    const out = await generateImage("a red cat");
    expect(out.source).toBe("pollinations");
    expect(out.imageMime).toBe("image/jpeg");
    expect(out.imageData).toBe(Buffer.from(PNG_BYTES).toString("base64"));
    // Exactly one Gemini call (a 429 quota error is never retried) and
    // one Pollinations call.
    const geminiCalls = fetchImpl.mock.calls.filter((c) => (c[0] as string).includes("generativelanguage"));
    const pollinationsCalls = fetchImpl.mock.calls.filter((c) => (c[0] as string).includes("pollinations"));
    expect(geminiCalls).toHaveLength(1);
    expect(pollinationsCalls).toHaveLength(1);
    expect(geminiCalls[0][0] as string).toContain("gemini-2.5-flash-image:generateContent");
    expect(pollinationsCalls[0][0] as string).toBe("https://image.pollinations.ai/prompt/a%20red%20cat?nologo=true");
  });

  it("Gemini success → its image wins the race and source is 'gemini'", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    // Pollinations is delayed 10ms so Gemini's immediate answer wins;
    // in the real world the winner is whichever provider answers first.
    const delayed = (v: unknown, ms: number) => new Promise((r) => setTimeout(() => r(v), ms));
    const fetchImpl = vi.fn((url: string) => {
      if (url.includes("pollinations")) return delayed(pollinationsReply(), 10);
      return Promise.resolve(geminiImageReply());
    });
    vi.stubGlobal("fetch", fetchImpl);
    const out = await generateImage("a red cat");
    expect(out.source).toBe("gemini");
    expect(out.imageData).toBe("iVBOR");
    expect(out.imageMime).toBe("image/png");
    // Both providers start in parallel (the race), so both are called;
    // Gemini's immediate answer wins and Pollinations' is discarded.
    expect(fetchImpl.mock.calls.filter((c) => (c[0] as string).includes("generativelanguage"))).toHaveLength(1);
    expect(fetchImpl.mock.calls.filter((c) => (c[0] as string).includes("pollinations"))).toHaveLength(1);
  });

  it("the race: a slow Gemini loses to a fast Pollinations, and vice versa", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    const delayed = (v: unknown, ms: number) => new Promise((r) => setTimeout(() => r(v), ms));
    // Slow Gemini (30ms), fast Pollinations (5ms) → pollinations wins.
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url.includes("pollinations")) return delayed(pollinationsReply(), 5);
        return delayed(geminiImageReply(), 30);
      }),
    );
    await expect(generateImage("a red cat")).resolves.toMatchObject({ source: "pollinations" });

    // Fast Gemini (5ms), slow Pollinations (30ms) → gemini wins.
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url.includes("pollinations")) return delayed(pollinationsReply(), 30);
        return delayed(geminiImageReply(), 5);
      }),
    );
    await expect(generateImage("a red cat")).resolves.toMatchObject({ source: "gemini" });
  });

  it("Gemini returns text only (no image data) → Pollinations is used", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    const fetchImpl = vi.fn((url: string) => {
      if (url.includes("pollinations")) return Promise.resolve(pollinationsReply());
      return Promise.resolve(geminiTextOnlyReply());
    });
    vi.stubGlobal("fetch", fetchImpl);
    const out = await generateImage("a red cat");
    expect(out.source).toBe("pollinations");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("Gemini 503 is retried once, then Pollinations is used", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    const fetchImpl = vi.fn((url: string) => {
      if (url.includes("pollinations")) return Promise.resolve(pollinationsReply());
      return Promise.resolve(geminiErrReply(503));
    });
    vi.stubGlobal("fetch", fetchImpl);
    const out = await generateImage("a red cat");
    expect(out.source).toBe("pollinations");
    const geminiCalls = fetchImpl.mock.calls.filter((c) => (c[0] as string).includes("generativelanguage"));
    expect(geminiCalls).toHaveLength(2);
  });

  it("both providers failing → honest 422 naming the quota problem", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    const fetchImpl = vi.fn((url: string) => {
      if (url.includes("pollinations")) return Promise.resolve(pollinationsErrReply(500));
      return Promise.resolve(geminiErrReply(429));
    });
    vi.stubGlobal("fetch", fetchImpl);
    let caught: (Error & { status?: number }) | undefined;
    try {
      await generateImage("a red cat");
    } catch (e) {
      caught = e as Error & { status?: number };
    }
    expect(caught).toBeDefined();
    expect(caught!.status).toBe(422);
    expect(caught!.message).toMatch(/quota/i);
    expect(caught!.message).toContain("429");
    expect(caught!.message).toMatch(/billing/i);
    expect(caught!.message).toMatch(/Pollinations/i);
  });

  it("image generation never calls a text model", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    const fetchImpl = vi.fn((url: string) => {
      if (url.includes("pollinations")) return Promise.resolve(pollinationsReply());
      return Promise.resolve(geminiErrReply(429));
    });
    vi.stubGlobal("fetch", fetchImpl);
    await generateImage("a red cat");
    for (const call of fetchImpl.mock.calls) {
      const url = call[0] as string;
      expect(url).not.toContain("gemini-3.8-flash");
      expect(url).not.toContain("gemini-3.6-flash");
      expect(url).not.toContain("gemini-3.5-flash-lite");
      expect(url.includes("gemini-2.5-flash-image") || url.includes("pollinations")).toBe(true);
    }
  });

  it("fetchPollinationsImage rejects a non-image response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => "text/html" },
        arrayBuffer: async () => new ArrayBuffer(10),
      }),
    );
    await expect(fetchPollinationsImage("a red cat")).rejects.toThrow(/did not return image data/);
  });
});
