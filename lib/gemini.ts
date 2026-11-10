import { geminiModel, geminiImageModel, geminiFallbackModels } from "./config";
export type GeminiGenerateOptions = {
  /** Override the model (default: GEMINI_MODEL). */
  model?: string;
  /** Passed through as the request's generationConfig (e.g. responseModalities). */
  generationConfig?: Record<string, unknown>;
  /** Per-model time slice for text calls (default 10s). A model that has
   *  not answered within its slice is abandoned and the chain moves on,
   *  so a slow first model cannot eat the whole call budget. */
  perModelSliceMs?: number;
};

/** Per-model slice for text calls: each model gets at most 10s of the
 *  30s total budget, so a slow-but-answering first model (gemini-3.8-flash
 *  was observed taking ~25s for a simple question) falls over to the next
 *  model instead of making the user wait the whole time. */
export const GEMINI_PER_MODEL_SLICE_MS = 10000;
/** Streaming: if a model produces no chunk within 10s of the request,
 *  abort that model's stream and try the next model. Once chunks are
 *  flowing, only the overall timeout applies. */
export const GEMINI_FIRST_CHUNK_DEADLINE_MS = 10000;
/** Text calls (chat/stream/vision) ask for at most 1024 output tokens,
 *  so replies stay short and finish sooner. Image calls are unaffected. */
export const GEMINI_TEXT_MAX_OUTPUT_TOKENS = 1024;

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
 * and the last failure, instead of a bare "provider error". Each text
 * model gets only a short slice of the total budget (10s by default):
 * a model that is merely slow — answering, but only after ~25s — is
 * abandoned at the end of its slice so the next model can answer sooner.
 * The whole chain is bounded by timeoutMs in total, so fallbacks cannot
 * stack 30-second waits. Text calls also cap output at 1024 tokens for
 * shorter, faster replies. An explicit opts.model (used by image
 * generation) never falls back to a text model: a text model could never
 * return image data. It retries once, but only on 5xx or a timeout — a
 * 429 is a quota error (on the current key the Gemini image quota is 0),
 * so retrying it seconds later cannot succeed and the caller falls back
 * to another image provider instead.
 */
export async function geminiGenerate(parts: unknown[], timeoutMs = 30000, opts: GeminiGenerateOptions = {}): Promise<{ text?: string; imageData?: string; imageMime?: string }> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw Object.assign(new Error("Gemini is not configured on the server (GEMINI_API_KEY missing)."), { status: 503 });
  const explicit = Boolean(opts.model);
  const models = explicit ? [opts.model as string] : [geminiModel, ...geminiFallbackModels];
  const sliceMs = opts.perModelSliceMs ?? GEMINI_PER_MODEL_SLICE_MS;
  // Text calls cap output tokens; an explicit (image) call passes its own
  // generationConfig through untouched.
  const generationConfig = explicit
    ? opts.generationConfig
    : { maxOutputTokens: GEMINI_TEXT_MAX_OUTPUT_TOKENS, ...(opts.generationConfig || {}) };
  const deadline = Date.now() + timeoutMs;
  const tried: string[] = [];
  for (const model of models) {
    // Explicit (image) model: one retry, but only on 5xx or a timeout,
    // with the full remaining budget. A 429 quota error is not retried:
    // on the current key the Gemini image quota is 0, so a retry seconds
    // later cannot succeed — fail fast so the caller can fall back to
    // another image provider. Text models get one attempt each, capped
    // at one time slice.
    for (let attempt = 0; attempt < (explicit ? 2 : 1); attempt++) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        tried.push(`${model} (timeout)`);
        break;
      }
      const perAttempt = explicit ? remaining : Math.min(sliceMs, remaining);
      try {
        return await generateOnce(model, parts, generationConfig, key, perAttempt);
      } catch (e) {
        if (!isProviderFailure(e)) throw e;
        if (!e.retryable) throw e;
        if (explicit) {
          const worthRetrying =
            (typeof e.providerStatus === "number" && e.providerStatus >= 500) ||
            e.providerStatus === "timeout";
          if (attempt === 0 && worthRetrying) continue;
        }
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
export async function geminiGenerateImage(parts: unknown[], timeoutMs = 20000): Promise<{ text?: string; imageData?: string; imageMime?: string }> {
  return geminiGenerate(parts, timeoutMs, {
    model: geminiImageModel,
    generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
  });
}
export const SYSTEM_PROMPT = "You are EDITH, a supportive personal assistant for productivity, studying, workload and non-clinical stress management. Be clear and helpful. For maths, show readable step-by-step explanations. Never claim to diagnose a medical or mental-health condition. Keep answers concise — a few short sentences or bullet points — unless the user asks for detail.";

/**
 * Streaming variant of geminiGenerate: yields text chunks as they arrive
 * from Gemini's streamGenerateContent SSE endpoint. The caller owns
 * cancellation (AbortSignal) and decides what to do with a partial reply.
 * Throws the same 503 when no key is configured, and 502 on provider
 * errors, so callers can fall back to the non-streaming route.
 */
/** Marker for a stream that produced no chunk within the first-chunk
 *  deadline: the caller treats it as a retryable failure and tries the
 *  next model, instead of waiting for a stalled model. */
function firstChunkTimeoutError(): Error & { firstChunkTimeout: true } {
  return Object.assign(new Error("No chunk received within the first-chunk deadline."), { firstChunkTimeout: true as const });
}
function isFirstChunkTimeout(e: unknown): boolean {
  return e instanceof Error && (e as { firstChunkTimeout?: unknown }).firstChunkTimeout === true;
}

async function* yieldStreamChunks(
  res: Response,
  timeoutMs: number,
  firstChunkDeadlineMs: number,
): AsyncGenerator<string, void, unknown> {
  const reader = (res.body as ReadableStream<Uint8Array>).getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const deadline = Date.now() + timeoutMs;
  let firstChunkSeen = false;
  try {
    for (;;) {
      if (Date.now() > deadline) break;
      // Until the first chunk arrives, each read races a deadline timer:
      // a model that connects but never starts sending is abandoned so
      // the next model can be tried. Once chunks are flowing, reads wait
      // normally under the overall deadline above.
      let readResult: ReadableStreamReadResult<Uint8Array>;
      if (!firstChunkSeen) {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const timeoutP = new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(firstChunkTimeoutError()), firstChunkDeadlineMs);
        });
        try {
          readResult = await Promise.race([reader.read(), timeoutP]);
        } finally {
          clearTimeout(timer);
        }
      } else {
        readResult = await reader.read();
      }
      const { done, value } = readResult;
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
          for (const p of outParts) {
            if (p.text) {
              firstChunkSeen = true;
              yield p.text;
            }
          }
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

export type GeminiStreamOptions = {
  /** No chunk within this long of a request: abandon that model and try
   *  the next one (default 10s). */
  firstChunkDeadlineMs?: number;
};

export async function* geminiGenerateStream(
  parts: unknown[],
  signal: AbortSignal,
  timeoutMs = 30000,
  opts: GeminiStreamOptions = {},
): AsyncGenerator<string, void, unknown> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw Object.assign(new Error("Gemini is not configured on the server (GEMINI_API_KEY missing)."), { status: 503 });
  // Same fallback chain as geminiGenerate: configured model first, then
  // gemini-3.6-flash, then gemini-3.5-flash-lite, on 404/429/5xx, a
  // failed request, or no chunk within the first-chunk deadline. A user
  // cancellation (signal aborted) is never retried — it is rethrown
  // immediately.
  const firstChunkDeadlineMs = opts.firstChunkDeadlineMs ?? GEMINI_FIRST_CHUNK_DEADLINE_MS;
  const models = [geminiModel, ...geminiFallbackModels];
  const tried: string[] = [];
  for (const model of models) {
    // Per-model controller: forwards user cancellation for the whole
    // attempt, and aborts the fetch itself if the model does not even
    // start responding within the first-chunk deadline.
    const ctrl = new AbortController();
    const forwardAbort = () => ctrl.abort();
    signal.addEventListener("abort", forwardAbort);
    // If the user already cancelled, fail fast instead of starting a
    // real request: the fetch below then rejects with an AbortError,
    // which is rethrown (never retried) below.
    if (signal.aborted) ctrl.abort();
    try {
      const fetchTimer = setTimeout(() => ctrl.abort(), firstChunkDeadlineMs);
      let res: Response;
      try {
        res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${key}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: ctrl.signal,
            body: JSON.stringify({
              contents: [{ parts }],
              generationConfig: { maxOutputTokens: GEMINI_TEXT_MAX_OUTPUT_TOKENS },
            }),
          },
        );
      } catch (e) {
        if (signal.aborted) throw e;
        tried.push(`${model} (${ctrl.signal.aborted ? "no first chunk" : "request failed"})`);
        continue;
      } finally {
        clearTimeout(fetchTimer);
      }
      if (!res.ok || !res.body) {
        if (signal.aborted) throw Object.assign(new Error("Stream cancelled."), { status: 499 });
        if (isRetryableStatus(res.status)) {
          tried.push(`${model} (${res.status})`);
          continue;
        }
        throw Object.assign(new Error(`Gemini provider error ${res.status} from model ${model}.`), { status: 502 });
      }
      try {
        yield* yieldStreamChunks(res, timeoutMs, firstChunkDeadlineMs);
      } catch (e) {
        if (signal.aborted) throw e;
        if (isFirstChunkTimeout(e)) {
          tried.push(`${model} (no first chunk)`);
          continue;
        }
        throw e;
      }
      return;
    } finally {
      signal.removeEventListener("abort", forwardAbort);
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
