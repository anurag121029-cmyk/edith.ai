import { NextResponse } from "next/server";
import { geminiGenerate } from "@/lib/gemini";
import { imageLimiter, clientIpFromHeaders } from "@/lib/rateLimit";
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
    const { imageData, imageMime, text } = await geminiGenerate([{ text: `Generate an image: ${prompt}` }]);
    if (!imageData) return NextResponse.json({ error: `The configured model (${process.env.GEMINI_MODEL || "gemini-2.0-flash"}) did not return image data. Set GEMINI_MODEL to a model that supports image generation (e.g. an image-generation Gemini model) and try again. No placeholder image was created.${text ? " Model said: " + text.slice(0,300) : ""}` }, { status: 422 });
    return NextResponse.json({ imageData, mimeType: imageMime || "image/png" });
  } catch (e) { const s = (e as {status?:number}).status || 500; return NextResponse.json({ error: (e as Error).message || "Image generation failed" }, { status: s }); }
}
