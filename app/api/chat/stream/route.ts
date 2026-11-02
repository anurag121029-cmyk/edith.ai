import { NextResponse } from "next/server";
import { validateChatInput } from "@/lib/logic";
import { chatLimiter, clientIpFromHeaders } from "@/lib/rateLimit";
import { geminiGenerateStream, SYSTEM_PROMPT } from "@/lib/gemini";
import { memoryContextBlock, historyContextBlock } from "@/lib/chatContext";

/**
 * Streaming chat: same validation, rate limit, history cap and memory cap
 * as POST /api/chat, but returns plain-text chunks as Gemini produces
 * them (Content-Type: text/plain; charset=utf-8, no SSE framing, so the
 * client just reads the body). The client saves the final accumulated
 * text as ONE assistant message, exactly like the non-streaming path.
 * If the provider errors before any chunk is produced, this route
 * returns a normal error JSON so the client can fall back to /api/chat.
 * If the client disconnects, the Gemini generator is aborted.
 */
export async function POST(req: Request) {
  const limit = chatLimiter.check(clientIpFromHeaders(req.headers));
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many chat requests. Please wait a moment and try again." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }
  const body = await req.json().catch(() => ({}));
  const v = validateChatInput(body?.message);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
  const context = historyContextBlock(body?.history);
  const memories = memoryContextBlock(body?.memories);
  const prompt = `${SYSTEM_PROMPT}\n\n${memories}${context}\nUser: ${v.value}`;

  const controller = new AbortController();
  req.signal.addEventListener("abort", () => controller.abort(), { once: true });

  let stream: ReadableStream<Uint8Array>;
  try {
    const gen = geminiGenerateStream([{ text: prompt }], controller.signal);
    const encoder = new TextEncoder();
    let produced = false;
    stream = new ReadableStream<Uint8Array>({
      async pull(ctrl) {
        const { value, done } = await gen.next();
        if (done) {
          ctrl.close();
          return;
        }
        if (value) {
          produced = true;
          ctrl.enqueue(encoder.encode(value));
        }
      },
      cancel() {
        controller.abort();
      },
    });
    // Prime the generator so a provider error surfaces BEFORE we commit
    // to a 200 stream: if the first chunk errors, return JSON instead.
    // We do this by wrapping: the first pull happens lazily, so instead
    // pre-fetch one step here and re-emit it.
    const first = await gen.next();
    if (first.done && !produced) {
      // Empty stream: treat as a provider error so the client falls back.
      return NextResponse.json({ error: "Gemini returned an empty response." }, { status: 502 });
    }
    const firstChunk = first.done ? null : first.value;
    const rest = stream;
    const reader = rest.getReader();
    stream = new ReadableStream<Uint8Array>({
      start(ctrl) {
        if (firstChunk) ctrl.enqueue(encoder.encode(firstChunk));
      },
      async pull(ctrl) {
        const { value, done } = await reader.read().catch(() => ({ value: undefined, done: true }));
        if (done) ctrl.close();
        else if (value) ctrl.enqueue(value);
      },
      cancel() {
        controller.abort();
        reader.cancel().catch(() => undefined);
      },
    });
  } catch (e) {
    const s = (e as { status?: number }).status || 500;
    return NextResponse.json({ error: (e as Error).message || "AI request failed" }, { status: s });
  }
  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
