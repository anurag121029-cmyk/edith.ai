/**
 * Server-only email provider interface for weekly-report delivery.
 *
 * Supported provider: Resend, enabled ONLY when BOTH are set:
 *   EMAIL_PROVIDER=resend   and   RESEND_API_KEY=<key>
 * (plus optional EMAIL_FROM; otherwise a generic noreply sender is used
 * and Resend may reject it if the domain is unverified — that failure is
 * reported honestly, never swallowed.)
 *
 * Honest behaviour by design:
 *  - No provider/key configured -> { ok: false, error: "Email delivery
 *    is not configured..." } and NOTHING is sent or claimed sent.
 *  - Unknown EMAIL_PROVIDER value -> same, with the value named.
 *  - Only the approved weekly-report summary is ever emailed: never
 *    conversations, memories, reflections or any other user content.
 *  - This module never touches the database; the route that calls it
 *    logs the attempt (success or failure) to report_deliveries.
 * No key is ever hardcoded here or logged.
 */
export type EmailResult = { ok: true; provider: string } | { ok: false; error: string };

export function emailProviderName(): string | null {
  const p = (process.env.EMAIL_PROVIDER || "").trim().toLowerCase();
  return p ? p : null;
}

export function isEmailConfigured(): boolean {
  return emailProviderName() === "resend" && Boolean(process.env.RESEND_API_KEY);
}

export function emailNotConfiguredError(): string {
  const p = emailProviderName();
  if (!p) return "Email delivery is not configured (EMAIL_PROVIDER is empty), so no report was sent.";
  if (p !== "resend") return `Email delivery is not configured: unknown provider "${p}" (only "resend" is supported), so no report was sent.`;
  return "Email delivery is not configured (RESEND_API_KEY is missing), so no report was sent.";
}

export async function sendWeeklyReportEmail(args: {
  to: string;
  weekStart: string;
  weekEnd: string;
  summary: string;
  fetchImpl?: typeof fetch;
}): Promise<EmailResult> {
  const provider = emailProviderName();
  if (provider !== "resend" || !process.env.RESEND_API_KEY) {
    return { ok: false, error: emailNotConfiguredError() };
  }
  const fetchFn = args.fetchImpl ?? fetch;
  const from = process.env.EMAIL_FROM || "EDITH AI <noreply@edith-ai.local>";
  const res = await fetchFn("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [args.to],
      subject: `EDITH AI weekly report: ${args.weekStart} to ${args.weekEnd}`,
      text: `Your EDITH AI weekly report (${args.weekStart} to ${args.weekEnd}):\n\n${args.summary}\n\nGenerated from your own tasks, study, workload and self-reported mood data. This is non-clinical wellness support only.`,
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return { ok: false, error: `Email provider error ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ""}` };
  }
  return { ok: true, provider: "resend" };
}
