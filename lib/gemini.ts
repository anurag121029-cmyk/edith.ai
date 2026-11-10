import { geminiModel, geminiImageModel, geminiFallbackModels } from "./config";
export type GeminiGenerateOptions = {
  /** Override the model (default: GEMINI_MODEL). */
  model?: string;
  /** Passed through as the request's generationConfig (e.g. responseModalities). */
  generationConfig?: Record<string, unknown>;
};

type ProviderFailure = Error & { status: number; retryable: boolean; providerStatus: string | number };
function providerFailure(message: string, retryable: boolean, providerStatus: string | number): ProviderFailure {
  return Object.assign(new Error(message), { status: 502, retryable, providerStatus });
}
function isProviderFailure(e: unknown): e is ProviderFailure {
  return e instanceof Error && typeof (e as ProviderFailure).retryable === "boolean";
}
/** 404 (retired), 429 and 5xx are worth trying another model for; other
 *  statuses (400 bad request, 401/403 bad key) would fail the same way on
 *  every model, so they are not retried. */
function isRetryableStatus(status: number): boolean {
  return status === 404 || status === 429 || status >= 500;
}

async function generateOnce(
  model: string,
  parts: unknown[],
  generationConfig: Record<string, unknown> | undefined,
  key: string,
  remainingMs: number,
): Promise<{ text?: string; imageData?: string; imageMime?: string }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), Math.max(remainingMs, 1));
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, signal: ctrl.signal,
      body: JSON.stringify({ contents: [{ parts }], ...(generationConfig ? { generationConfig } : {}) }),
    });
    if (res.ok) {
      const data = await res.json();
      const outParts = data?.candidates?.[0]?.content?.parts || [];
      let text = ""; let imageData: string | undefined; let imageMime: string | undefined;
      for (const p of outParts) { if (p.text) text += p.text; if (p.inlineData?.data) { imageData = p.inlineData.data; imageMime = p.inlineData.mimeType; } }
      return { text: text || undefined, imageData, imageMime };
    }
    if (!isRetryableStatus(res.status)) {
      throw providerFailure(`Gemini provider error ${res.status} from model ${model}.`, false, res.status);
    }
    throw providerFailure(`Model ${model} returned ${res.status}.`, true, res.status);
  } catch (e) {
    if (isProviderFailure(e)) throw e;
    if ((e as Error).name === "AbortError") {
      throw providerFailure(`Model ${model} timed out.`, true, "timeout");
    }
    throw providerFailure(`Model ${model} request failed: ${(e as Error).message || "network error"}.`, true, "network error");
  } finally {
    clearTimeout(t);
  }
}

/**
 * Text generation with a model fallback chain. Tries the configured model
 * (GEMINI_MODEL, default gemini-3.8-flash) first; on 404, 429, 5xx or a
 * timeout it falls back in order to gemini-3.6-flash then
 * gemini-3.5-flash-lite, and only then errors — naming every model tried
 * and the last failure, instead of a bare "provider error". The whole
 * chain is bounded by timeoutMs in total, so fallbacks cannot stack
 * 30-second waits. An explicit opts.model (used by image generation)
 * never falls back: a text model could never return image data, so a
 * single-model retry is kept there instead.
 */
export async function geminiGenerate(parts: unknown[], timeoutMs = 30000, opts: GeminiGenerateOptions = {}): Promise<{ text?: string; imageData?: string; imageMime?: string }> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw Object.assign(new Error("Gemini is not configured on the server (GEMINI_API_KEY missing)."), { status: 503 });
  const explicit = Boolean(opts.model);
  const models = explicit ? [opts.model as string] : [geminiModel, ...geminiFallbackModels];
  const deadline = Date.now() + timeoutMs;
  const tried: string[] = [];
  for (const model of models) {
    // Explicit (image) model keeps the old behaviour: one retry on a
    // retryable failure. Fallback models get one attempt each.
    for (let attempt = 0; attempt < (explicit ? 2 : 1); attempt++) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        tried.push(`${model} (timeout)`);
        break;
      }
      try {
        return await generateOnce(model, parts, opts.generationConfig, key, remaining);
      } catch (e) {
        if (!isProviderFailure(e)) throw e;
        if (!e.retryable) throw e;
        if (explicit && attempt === 0) continue;
        tried.push(`${model} (${e.providerStatus})`);
        break;
      }
    }
  }
  const detail = tried.length ? tried.join(", ") : "no model attempted";
  const retired = tried.some((t) => t.includes("(404)"));
  throw Object.assign(
    new Error(
      `Gemini provider error: tried ${detail} and none answered.${retired ? " A 404 means a model may be retired or unavailable — check GEMINI_MODEL." : ""}`,
    ),
    { status: 502 },
  );
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
async function* yieldStreamChunks(res: Response, timeoutMs: number): AsyncGenerator<string, void, unknown> {
  const reader = (res.body as ReadableStream<Uint8Array>).getReader();
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

export async function* geminiGenerateStream(
  parts: unknown[],
  signal: AbortSignal,
  timeoutMs = 30000,
): AsyncGenerator<string, void, unknown> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw Object.assign(new Error("Gemini is not configured on the server (GEMINI_API_KEY missing)."), { status: 503 });
  // Same fallback chain as geminiGenerate: configured model first, then
  // gemini-3.6-flash, then gemini-3.5-flash-lite, on 404/429/5xx or a
  // failed request. A user cancellation (signal aborted) is never
  // retried — it is rethrown immediately.
  const models = [geminiModel, ...geminiFallbackModels];
  const tried: string[] = [];
  for (const model of models) {
    let res: Response;
    try {
      res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${key}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal,
          body: JSON.stringify({ contents: [{ parts }] }),
        },
      );
    } catch (e) {
      if (signal.aborted) throw e;
      tried.push(`${model} (request failed)`);
      continue;
    }
    if (!res.ok || !res.body) {
      if (signal.aborted) throw Object.assign(new Error("Stream cancelled."), { status: 499 });
      if (isRetryableStatus(res.status)) {
        tried.push(`${model} (${res.status})`);
        continue;
      }
      throw Object.assign(new Error(`Gemini provider error ${res.status} from model ${model}.`), { status: 502 });
    }
    yield* yieldStreamChunks(res, timeoutMs);
    return;
  }
  const detail = tried.length ? tried.join(", ") : "no model attempted";
  const retired = tried.some((t) => t.includes("(404)"));
  throw Object.assign(
    new Error(
      `Gemini provider error: tried ${detail} and none answered.${retired ? " A 404 means a model may be retired or unavailable — check GEMINI_MODEL." : ""}`,
    ),
    { status: 502 },
  );
}
