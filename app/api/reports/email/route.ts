import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { sendWeeklyReportEmail, emailProviderName } from "@/lib/email";

/**
 * POST /api/reports/email { reportId }
 * Authenticated, owner-only: the report is fetched through the signed-in
 * user's Supabase client (RLS), the recipient is the signed-in user's own
 * email address, and ONLY the report summary is sent — never
 * conversations, memories or reflections. Every attempt (success or
 * failure, including "not configured") is logged to report_deliveries.
 * When no provider is configured this returns a clear error and claims
 * no delivery — the UI offers print/PDF instead.
 */
export async function POST(req: Request) {
  const sb = await createServerSupabase();
  if (!sb) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user || !auth.user.email) {
    return NextResponse.json({ error: "Sign in to email a report." }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const reportId = body?.reportId;
  if (!reportId) return NextResponse.json({ error: "Missing reportId." }, { status: 400 });

  const { data: report, error } = await sb
    .from("weekly_reports")
    .select("id,week_start,week_end,summary")
    .eq("id", reportId)
    .single();
  if (error || !report) return NextResponse.json({ error: "Report not found." }, { status: 404 });

  const result = await sendWeeklyReportEmail({
    to: auth.user.email,
    weekStart: report.week_start,
    weekEnd: report.week_end,
    summary: report.summary,
  });
  // Log the attempt regardless of outcome (best effort; a logging failure
  // must not turn a successful send into a reported failure).
  try {
    await sb.from("report_deliveries").insert({
      user_id: auth.user.id,
      report_id: report.id,
      recipient_email: auth.user.email,
      status: result.ok ? "sent" : "failed",
      provider: emailProviderName(),
    });
  } catch {
    /* logging failure must not mask the delivery result */
  }

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 503 });
  return NextResponse.json({ ok: true, delivered: true });
}
