import { NextResponse } from "next/server";
import { validateChatInput } from "@/lib/logic";
import { chatLimiter, clientIpFromHeaders } from "@/lib/rateLimit";
import { geminiGenerate, SYSTEM_PROMPT } from "@/lib/gemini";

/**
 * Server-side cap for client-supplied memories: at most 5 items, each
 * truncated, total context bounded. The client must only send the user's
 * own enabled, relevant memories; the server never trusts the client to
 * have capped them, and never receives (or sends to Gemini) the full
 * memory list or the full conversation history.
 */
function memoryContextBlock(raw: unknown): string {
  if (!Array.isArray(raw)) return "";
  const items = raw
    .filter((m): m is { title?: unknown; content?: unknown } => !!m && typeof m === "object")
    .slice(0, 5)
    .map((m) => `- ${String(m.title || "").slice(0, 100)}: ${String(m.content || "").slice(0, 300)}`)
    .filter((line) => line.length > 3);
  if (!items.length) return "";
  return `User-approved saved memories (use only if relevant; do not repeat them verbatim unless helpful):\n${items.join("\n")}\n\n`;
}

export async function POST(req: Request) {
  const limit = chatLimiter.check(clientIpFromHeaders(req.headers));
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many chat requests. Please wait a moment and try again." }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const v = validateChatInput(body?.message);
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
    const history = Array.isArray(body?.history) ? body.history.slice(-10) : [];
    const context = history.map((h: {role?:string;content?:string}) => `${h.role === "assistant" ? "EDITH" : "User"}: ${String(h.content||"").slice(0,1000)}`).join("\n");
    const memories = memoryContextBlock(body?.memories);
    const { text } = await geminiGenerate([{ text: `${SYSTEM_PROMPT}\n\n${memories}${context}\nUser: ${v.value}` }]);
    if (!text) return NextResponse.json({ error: "Gemini returned an empty response." }, { status: 502 });
    return NextResponse.json({ reply: text });
  } catch (e) { const s = (e as {status?:number}).status || 500; return NextResponse.json({ error: (e as Error).message || "AI request failed" }, { status: s }); }
}
