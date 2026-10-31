import { geminiModel } from "./config";
export async function geminiGenerate(parts: unknown[], timeoutMs = 30000): Promise<{ text?: string; imageData?: string; imageMime?: string }> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw Object.assign(new Error("Gemini is not configured on the server (GEMINI_API_KEY missing)."), { status: 503 });
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${key}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: ctrl.signal,
        body: JSON.stringify({ contents: [{ parts }] }),
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
export const SYSTEM_PROMPT = "You are EDITH, a supportive personal assistant for productivity, studying, workload and non-clinical stress management. Be clear and helpful. For maths, show readable step-by-step explanations. Never claim to diagnose a medical or mental-health condition.";
