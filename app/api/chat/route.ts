import { NextResponse } from "next/server";
import { validateChatInput } from "@/lib/logic";
import { chatLimiter, clientIpFromHeaders } from "@/lib/rateLimit";
import { geminiGenerate, SYSTEM_PROMPT } from "@/lib/gemini";
import { memoryContextBlock, historyContextBlock } from "@/lib/chatContext";

export async function POST(req: Request) {
  const limit = chatLimiter.check(clientIpFromHeaders(req.headers));
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many chat requests. Please wait a moment and try again." }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const v = validateChatInput(body?.message);
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
    const context = historyContextBlock(body?.history);
    const memories = memoryContextBlock(body?.memories);
    const { text } = await geminiGenerate([{ text: `${SYSTEM_PROMPT}\n\n${memories}${context}\nUser: ${v.value}` }]);
    if (!text) return NextResponse.json({ error: "Gemini returned an empty response." }, { status: 502 });
    return NextResponse.json({ reply: text });
  } catch (e) { const s = (e as {status?:number}).status || 500; return NextResponse.json({ error: (e as Error).message || "AI request failed" }, { status: s }); }
}
