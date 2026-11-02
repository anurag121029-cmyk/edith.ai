import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { createServerSupabase } from "@/lib/supabase/server";
import { sanitizeForPdf, wrapText } from "@/lib/pdf";

/**
 * GET /api/report-pdf?id=<weekly_report id>
 * Authenticated, owner-only: the row is fetched through the signed-in
 * user's Supabase client (RLS: user_id = auth.uid()), so another user's
 * report id simply returns 404 here — never another user's data.
 * Only the report's own summary/week fields are rendered; no message
 * bodies, memories or reflections are included (the export opt-in in
 * Settings does not apply to PDFs, which never carry conversations).
 */
export async function GET(req: Request) {
  const sb = await createServerSupabase();
  if (!sb) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Sign in to download a report." }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing report id." }, { status: 400 });

  const { data: report, error } = await sb
    .from("weekly_reports")
    .select("id,week_start,week_end,summary")
    .eq("id", id)
    .single();
  if (error || !report) return NextResponse.json({ error: "Report not found." }, { status: 404 });

  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const margin = 50;
  const width = 595.28; // A4
  const height = 841.89;
  let page = doc.addPage([width, height]);
  let y = height - margin;
  const maxWidth = width - margin * 2;
  const drawLine = (text: string, size: number, useBold = false, gap = 18) => {
    if (y < margin + gap) {
      page = doc.addPage([width, height]);
      y = height - margin;
    }
    page.drawText(text, { x: margin, y, size, font: useBold ? bold : font, color: rgb(0.09, 0.09, 0.16) });
    y -= gap;
  };

  drawLine("EDITH AI — Weekly Report", 18, true, 26);
  drawLine(`Week ${report.week_start} to ${report.week_end}`, 12, false, 22);
  drawLine("Generated from your own tasks, study, workload and self-reported mood data.", 10, false, 24);
  for (const line of wrapText(
    sanitizeForPdf(report.summary),
    (t) => font.widthOfTextAtSize(t, 11),
    maxWidth,
  )) {
    drawLine(line || " ", 11, false, 15);
  }
  drawLine("Non-clinical wellness support only — mood/stress figures are self-reported.", 9, false, 14);

  const bytes = await doc.save();
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="edith-weekly-report-${report.week_start}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
