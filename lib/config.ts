export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
export const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);
export const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
export const geminiModel = process.env.GEMINI_MODEL || "gemini-3.8-flash";
// Image generation needs a model that returns image data — the chat model
// (gemini-3.8-flash) never does, so it has its own setting. Default is
// Gemini 2.5 Flash Image ("Nano Banana"), called via :generateContent
// with generationConfig.responseModalities ["TEXT","IMAGE"].
export const geminiImageModel = process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";
export const isEmailConfigured = Boolean(process.env.EMAIL_PROVIDER);
