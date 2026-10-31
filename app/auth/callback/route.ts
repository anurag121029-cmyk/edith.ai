import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
export async function GET(req: Request) {
  const url = new URL(req.url); const code = url.searchParams.get("code");
  const next = url.searchParams.get("next")?.startsWith("/") ? url.searchParams.get("next")! : "/onboarding";
  if (code) { const sb = await createServerSupabase(); if (sb) await sb.auth.exchangeCodeForSession(code); }
  return NextResponse.redirect(new URL(next, url.origin));
}
