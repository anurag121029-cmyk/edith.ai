import { NextResponse } from "next/server";
import { generateImage } from "@/lib/imageGeneration";
import { imageLimiter, clientIpFromHeaders } from "@/lib/rateLimit";
/**
 * POST /api/image — Gemini first, free Pollinations fallback.
 * Returns { imageData, mimeType, source } where source is "gemini" or
 * "pollinations". A 422 now means BOTH providers failed for that prompt;
 * its message names the quota problem plainly (the current Gemini key
 * has 0 image quota) instead of pretending the prompt was the problem.
 */
export async function POST(req: Request) {
  const limit = imageLimiter.check(clientIpFromHeaders(req.headers));
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many image requests. Please wait a moment and try again." }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
    if (!prompt) return NextResponse.json({ error: "A prompt is required." }, { status: 400 });
    if (prompt.length > 1000) return NextResponse.json({ error: "Prompt exceeds 1000 characters." }, { status: 400 });
    const { imageData, imageMime, source } = await generateImage(prompt);
    return NextResponse.json({ imageData, mimeType: imageMime, source });
  } catch (e) { const s = (e as {status?:number}).status || 500; return NextResponse.json({ error: (e as Error).message || "Image generation failed" }, { status: s }); }
}
