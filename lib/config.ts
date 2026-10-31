export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
export const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);
export const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
export const geminiModel = process.env.GEMINI_MODEL || "gemini-2.0-flash";
export const isEmailConfigured = Boolean(process.env.EMAIL_PROVIDER);
