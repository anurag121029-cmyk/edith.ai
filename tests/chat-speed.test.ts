import { describe, it, expect, vi, afterEach } from "vitest";
import {
  geminiGenerate,
  geminiGenerateImage,
  geminiGenerateStream,
  GEMINI_PER_MODEL_SLICE_MS,
  GEMINI_FIRST_CHUNK_DEADLINE_MS,
  GEMINI_TEXT_MAX_OUTPUT_TOKENS,
  SYSTEM_PROMPT,
} from "../lib/gemini";

function okReply(text: string) {
  return {
    ok: true,
    json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }),
  };
}
function errReply(status: number) {
  return { ok: false, status, json: async () => ({}) };
}
function abortError() {
  return Object.assign(new Error("The operation was aborted"), { name: "AbortError" });
}
/** A fetch that never resolves, but rejects like real fetch when its
 *  signal is aborted — mirrors what a slow model looks like to the
 *  per-model slice timer. */
function slowFetch(_url: string, init: { signal?: AbortSignal }) {
  return new Promise<never>((_resolve, reject) => {
    init.signal?.addEventListener("abort", () => reject(abortError()), { once: true });
  });
}
function sseBody(text: string) {
  const enc = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(enc.encode(`data: {"candidates":[{"content":{"parts":[{"text":"${text}"}]}}]}\n\n`));
      c.close();
    },
  });
}
/** A stream that connects but never sends a chunk. */
function silentBody() {
  return new ReadableStream<Uint8Array>({});
}

describe("chat speed: slow-model failover", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("uses a 10s per-model slice and a 10s first-chunk deadline", () => {
    expect(GEMINI_PER_MODEL_SLICE_MS).toBe(10000);
    expect(GEMINI_FIRST_CHUNK_DEADLINE_MS).toBe(10000);
    expect(GEMINI_TEXT_MAX_OUTPUT_TOKENS).toBe(1024);
  });

  it("a slow first model (never answers within its slice) falls back to the next model", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    const fetchImpl = vi.fn()
      .mockImplementationOnce(slowFetch)
      .mockResolvedValueOnce(okReply("from fallback"));
    vi.stubGlobal("fetch", fetchImpl);
    const started = Date.now();
    const out = await geminiGenerate([{ text: "hello" }], 30000, { perModelSliceMs: 50 });
    const tookMs = Date.now() - started;
    expect(out.text).toBe("from fallback");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[0][0] as string).toContain("gemini-3.8-flash:generateContent");
    expect(fetchImpl.mock.calls[1][0] as string).toContain("gemini-3.6-flash:generateContent");
    // The slow model was abandoned after its ~50ms slice, not after the
    // full 30s budget: the whole call finishes in well under a second.
    expect(tookMs).toBeLessThan(5000);
  });

  it("a streaming model with no chunk in the deadline falls back to the next model", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce({ ok: true, body: silentBody() })
      .mockResolvedValueOnce({ ok: true, body: sseBody("streamed") });
    vi.stubGlobal("fetch", fetchImpl);
    const started = Date.now();
    const chunks: string[] = [];
    for await (const chunk of geminiGenerateStream([{ text: "hello" }], new AbortController().signal, 30000, { firstChunkDeadlineMs: 50 })) {
      chunks.push(chunk);
    }
    const tookMs = Date.now() - started;
    expect(chunks.join("")).toBe("streamed");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[0][0] as string).toContain("gemini-3.8-flash:streamGenerateContent");
    expect(fetchImpl.mock.calls[1][0] as string).toContain("gemini-3.6-flash:streamGenerateContent");
    expect(tookMs).toBeLessThan(5000);
  });

  it("a streaming fetch that never starts responding falls back too", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    const fetchImpl = vi.fn()
      .mockImplementationOnce(slowFetch)
      .mockResolvedValueOnce({ ok: true, body: sseBody("streamed") });
    vi.stubGlobal("fetch", fetchImpl);
    const chunks: string[] = [];
    for await (const chunk of geminiGenerateStream([{ text: "hello" }], new AbortController().signal, 30000, { firstChunkDeadlineMs: 50 })) {
      chunks.push(chunk);
    }
    expect(chunks.join("")).toBe("streamed");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("sends maxOutputTokens 1024 on text calls, and asks for concise answers", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    const fetchImpl = vi.fn().mockResolvedValue(okReply("short"));
    vi.stubGlobal("fetch", fetchImpl);
    await geminiGenerate([{ text: "hello" }]);
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body as string);
    expect(body.generationConfig.maxOutputTokens).toBe(1024);
    expect(SYSTEM_PROMPT).toContain("concise");
    expect(SYSTEM_PROMPT).toContain("Never claim to diagnose");
  });

  it("sends maxOutputTokens 1024 on streaming calls", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, body: sseBody("hi") });
    vi.stubGlobal("fetch", fetchImpl);
    const chunks: string[] = [];
    for await (const chunk of geminiGenerateStream([{ text: "hello" }], new AbortController().signal)) {
      chunks.push(chunk);
    }
    expect(chunks.join("")).toBe("hi");
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body as string);
    expect(body.generationConfig.maxOutputTokens).toBe(1024);
  });

  it("image generation still never falls back to a text model and gets no token cap", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    const fetchImpl = vi.fn().mockResolvedValue(errReply(503));
    vi.stubGlobal("fetch", fetchImpl);
    await expect(geminiGenerateImage([{ text: "Generate an image: a cat" }])).rejects.toThrow(/gemini-2\.5-flash-image/);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    for (const call of fetchImpl.mock.calls) {
      expect(call[0] as string).toContain("gemini-2.5-flash-image:generateContent");
      const body = JSON.parse(call[1].body as string);
      expect(body.generationConfig).toEqual({ responseModalities: ["TEXT", "IMAGE"] });
      expect(body.generationConfig.maxOutputTokens).toBeUndefined();
    }
  });

  it("names a slow model as tried (timeout) when every model is slow", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    const fetchImpl = vi.fn().mockImplementation(slowFetch);
    vi.stubGlobal("fetch", fetchImpl);
    let caught: Error | undefined;
    try {
      await geminiGenerate([{ text: "hello" }], 30000, { perModelSliceMs: 20 });
    } catch (e) {
      caught = e as Error;
    }
    expect(caught).toBeDefined();
    expect(caught!.message).toContain("gemini-3.8-flash (timeout)");
    expect(caught!.message).toContain("gemini-3.6-flash (timeout)");
    expect(caught!.message).toContain("gemini-3.5-flash-lite (timeout)");
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
});
