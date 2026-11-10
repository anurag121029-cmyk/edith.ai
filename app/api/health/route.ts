import { NextResponse } from "next/server";
import { isSupabaseConfigured, geminiImageModel } from "@/lib/config";
export async function GET() {
  return NextResponse.json({ ok: true, app: "edith-ai", checks: {
    supabaseConfigured: isSupabaseConfigured,
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
    geminiModel: process.env.GEMINI_MODEL || "gemini-2.0-flash",
    geminiImageModel,
    emailConfigured: Boolean(process.env.EMAIL_PROVIDER),
    serviceRoleConfigured: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
  }, note: "This endpoint reports configuration presence only; it never returns secret values. Full DB table checks: run the health query at the end of supabase/apply-all.sql in the Supabase SQL editor." });
}
