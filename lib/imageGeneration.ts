/**
 * Image generation with a working fallback.
 *
 * Gemini is tried FIRST (better quality when its quota exists). But the
 * current Gemini key's Google project has ZERO free-tier quota for image
 * generation — gemini-2.5-flash-image and gemini-3-pro-image-preview both
 * answer 429 "Quota exceeded ... limit: 0" — so on this key Gemini images
 * can never succeed until billing is enabled on that Google project. No
 * code change can give Gemini image quota, so when Gemini fails (429,
 * 5xx, timeout, or no image data) the free Pollinations service is used
 * instead: no key, no account, the image bytes are fetched server-side
 * and returned as base64 exactly like a Gemini image.
 *
 * The response always says which provider produced the image
 * ("gemini" | "pollinations"), and the image page labels a fallback
 * image honestly. Only when BOTH providers fail does the call error
 * (422), with a message that names the quota problem plainly.
 */
import { geminiGenerateImage } from "./gemini";
import { geminiImageModel } from "./config";

/** Gemini image calls get 20s, so a slow quota error does not eat the
 *  whole budget before the fallback runs. */
export const GEMINI_IMAGE_TIMEOUT_MS = 20000;
/** Pollinations fetch budget. Worst case for one image call is roughly
 *  20s (Gemini) + 20s (Pollinations) plus overhead. */
export const POLLINATIONS_TIMEOUT_MS = 20000;

export const POLLINATIONS_BASE_URL = "https://image.pollinations.ai/prompt";

/** Exact fallback URL: the prompt, URL-encoded, with nologo so no
 *  Pollinations watermark is baked into the image. Default size is
 *  1024x1024. */
export function pollinationsImageUrl(prompt: string): string {
  return `${POLLINATIONS_BASE_URL}/${encodeURIComponent(prompt)}?nologo=true`;
}

export type ImageSource = "gemini" | "pollinations";

/** Fetch an image from Pollinations and return it as base64, like a
 *  Gemini image. Throws on a non-image response, an empty body, or a
 *  timeout. */
export async function fetchPollinationsImage(
  prompt: string,
  timeoutMs = POLLINATIONS_TIMEOUT_MS,
): Promise<{ imageData: string; imageMime: string }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), Math.max(timeoutMs, 1));
  try {
    const res = await fetch(pollinationsImageUrl(prompt), { signal: ctrl.signal });
    if (!res.ok) throw new Error(`Pollinations returned ${res.status}.`);
    const mime = (res.headers?.get?.("content-type") || "image/png").split(";")[0].trim();
    if (!mime.startsWith("image/")) throw new Error("Pollinations did not return image data.");
    const buf = await res.arrayBuffer();
    if (!buf.byteLength) throw new Error("Pollinations returned an empty image.");
    return { imageData: Buffer.from(buf).toString("base64"), imageMime: mime };
  } catch (e) {
    if ((e as Error).name === "AbortError") throw new Error("Pollinations timed out.");
    throw e;
  } finally {
    clearTimeout(t);
  }
}

/**
 * Generate an image for a prompt: Gemini first, Pollinations fallback.
 * Returns the image bytes (base64), its mime type, and which provider
 * produced it. Throws with status 422 only when both providers fail.
 */
export async function generateImage(prompt: string): Promise<{
  imageData: string;
  imageMime: string;
  source: ImageSource;
}> {
  let geminiError = "";
  try {
    const out = await geminiGenerateImage(
      [{ text: `Generate an image: ${prompt}` }],
      GEMINI_IMAGE_TIMEOUT_MS,
    );
    if (out.imageData) {
      return { imageData: out.imageData, imageMime: out.imageMime || "image/png", source: "gemini" };
    }
    geminiError = "returned no image data";
  } catch (e) {
    geminiError = (e as Error).message || "failed";
  }

  try {
    const out = await fetchPollinationsImage(prompt);
    return { ...out, source: "pollinations" };
  } catch (e) {
    const fallbackError = (e as Error).message || "failed";
    const quota = geminiError.includes("429");
    const geminiPart = quota
      ? `Gemini (${geminiImageModel}) has no image quota on this key — the provider returned 429 with a quota limit of 0`
      : `Gemini (${geminiImageModel}) failed (${geminiError})`;
    throw Object.assign(
      new Error(
        `Image generation failed: ${geminiPart}, and the free Pollinations fallback also failed (${fallbackError}).` +
          (quota
            ? " Enable billing in Google AI Studio to restore Gemini images, then try again."
            : " Please try again in a moment."),
      ),
      { status: 422 },
    );
  }
}
