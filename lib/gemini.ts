import { geminiModel, geminiImageModel } from "./config";
export type GeminiGenerateOptions = {
  /** Override the model (default: GEMINI_MODEL). */
  model?: string;
  /** Passed through as the request's generationConfig (e.g. responseModalities). */
  generationConfig?: Record<string, unknown>;
};
export async function geminiGenerate(parts: unknown[], timeoutMs = 30000, opts: GeminiGenerateOptions = {}): Promise<{ text?: string; imageData?: string; imageMime?: string }> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw Object.assign(new Error("Gemini is not configured on the server (GEMINI_API_KEY missing)."), { status: 503 });
  const model = opts.model || geminiModel;
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: ctrl.signal,
        body: JSON.stringify({ contents: [{ parts }], ...(opts.generationConfig ? { generationConfig: opts.generationConfig } : {}) }),
      });
      if ((res.status === 429 || res.status >= 500) && attempt === 0) { lastErr = new Error(`Gemini provider error ${res.status}`); continue; }
      if (!res.ok) throw Object.assign(new Error(`Gemini provider error ${res.status}`), { status: 502 });
      const data = await res.json();
      const outParts = data?.candidates?.[0]?.content?.parts || [];
      let text = ""; let imageData: string | undefined; let imageMime: string | undefined;
      for (const p of outParts) { if (p.text) text += p.text; if (p.inlineData?.data) { imageData = p.inlineData.data; imageMime = p.inlineData.mimeType; } }
      return { text: text || undefined, imageData, imageMime };
    } catch (e) { lastErr = e; if (attempt === 0 && (e as Error).name === "AbortError") continue; throw e; }
    finally { clearTimeout(t); }
  }
  throw lastErr || new Error("Gemini request failed");
}

/**
 * Image generation: uses the separate image model (GEMINI_IMAGE_MODEL,
 * default gemini-2.5-flash-image) and explicitly requests image output.
 * The chat model must never be used here — it returns text only, so an
 * image request against it can never succeed. responseModalities must
 * include TEXT as well as IMAGE: image-only requests are unreliable
 * (sometimes refused) on this endpoint.
 */
export async function geminiGenerateImage(parts: unknown[], timeoutMs = 30000): Promise<{ text?: string; imageData?: string; imageMime?: string }> {
  return geminiGenerate(parts, timeoutMs, {
    model: geminiImageModel,
    generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
  });
}
export const SYSTEM_PROMPT = "You are EDITH, a supportive personal assistant for productivity, studying, workload and non-clinical stress management. Be clear and helpful. For maths, show readable step-by-step explanations. Never claim to diagnose a medical or mental-health condition.";

/**
 * Streaming variant of geminiGenerate: yields text chunks as they arrive
 * from Gemini's streamGenerateContent SSE endpoint. The caller owns
 * cancellation (AbortSignal) and decides what to do with a partial reply.
 * Throws the same 503 when no key is configured, and 502 on provider
 * errors, so callers can fall back to the non-streaming route.
 */
export async function* geminiGenerateStream(
  parts: unknown[],
  signal: AbortSignal,
  timeoutMs = 30000,
): AsyncGenerator<string, void, unknown> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw Object.assign(new Error("Gemini is not configured on the server (GEMINI_API_KEY missing)."), { status: 503 });
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:streamGenerateContent?alt=sse&key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({ contents: [{ parts }] }),
    },
  );
  if (!res.ok || !res.body) {
    throw Object.assign(new Error(`Gemini provider error ${res.status}`), { status: 502 });
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const deadline = Date.now() + timeoutMs;
  try {
    for (;;) {
      if (Date.now() > deadline) break;
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const data = JSON.parse(payload);
          const outParts = data?.candidates?.[0]?.content?.parts || [];
          for (const p of outParts) if (p.text) yield p.text;
        } catch {
          /* skip a malformed SSE line rather than aborting the stream */
        }
      }
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      /* already closed */
    }
  }
}
