import { NextResponse } from "next/server";
import { geminiGenerate } from "@/lib/gemini";
import { visionLimiter, clientIpFromHeaders } from "@/lib/rateLimit";
const ALLOWED = ["image/png","image/jpeg","image/webp","image/gif"];
export async function POST(req: Request) {
  const limit = visionLimiter.check(clientIpFromHeaders(req.headers));
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many vision requests. Please wait a moment and try again." }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const { imageBase64, mimeType, question } = body || {};
    if (!imageBase64 || typeof imageBase64 !== "string") return NextResponse.json({ error: "imageBase64 is required." }, { status: 400 });
    if (!ALLOWED.includes(mimeType)) return NextResponse.json({ error: "Unsupported image type. Use PNG, JPEG, WebP or GIF." }, { status: 400 });
    if (imageBase64.length > 7_000_000) return NextResponse.json({ error: "Image too large (max ~5MB)." }, { status: 413 });
    const q = typeof question === "string" && question.trim() ? question.slice(0,1000) : "Describe this image and answer any question it raises.";
    const { text } = await geminiGenerate([{ text: q }, { inlineData: { mimeType, data: imageBase64 } }]);
    if (!text) return NextResponse.json({ error: "Gemini returned an empty response for this image." }, { status: 502 });
    return NextResponse.json({ reply: text });
  } catch (e) { const s = (e as {status?:number}).status || 500; return NextResponse.json({ error: (e as Error).message || "Vision request failed" }, { status: s }); }
}
