export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
export const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);
export const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
export const geminiModel = process.env.GEMINI_MODEL || "gemini-3.8-flash";
// Fallback text models, tried in order when the configured model answers
// 404 (retired), 429, 5xx, or times out. gemini-3.8-flash was observed
// returning 503 (high demand) and timing out; gemini-3.6-flash answered
// 200. Only text calls (chat/stream/vision) fall back — image generation
// uses its own model and never falls back to a text model.
export const geminiFallbackModels = ["gemini-3.6-flash", "gemini-3.5-flash-lite"];
// Image generation needs a model that returns image data — the chat model
// (gemini-3.8-flash) never does, so it has its own setting. Default is
// Gemini 2.5 Flash Image ("Nano Banana"), called via :generateContent
// with generationConfig.responseModalities ["TEXT","IMAGE"].
export const geminiImageModel = process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";
export const isEmailConfigured = Boolean(process.env.EMAIL_PROVIDER);
