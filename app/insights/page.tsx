"use client";
import { useEffect, useState } from "react";
import { AppShell, Glass, EmptyState } from "@/components/ui";
import { useUser } from "@/lib/useUser";
import { weeklyReport, weekBounds } from "@/lib/logic";
type Report={id:string;week_start:string;week_end:string;summary:string;created_at:string};
export default function Page(){
  const { user, sb } = useUser();
  const [reports,setReports]=useState<Report[]>([]); const [current,setCurrent]=useState(""); const [err,setErr]=useState(""); const [busy,setBusy]=useState(false);
  const [pdfBusy,setPdfBusy]=useState<string|null>(null); const [emailBusy,setEmailBusy]=useState<string|null>(null); const [note,setNote]=useState("");
  async function downloadPdf(r:Report){ setPdfBusy(r.id); setNote(""); setErr("");
    try{ const res=await fetch(`/api/report-pdf?id=${encodeURIComponent(r.id)}`); if(!res.ok){ const d=await res.json().catch(()=>({})); throw new Error(d.error||"Server PDF failed"); }
      const blob=await res.blob(); const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=`edith-weekly-report-${r.week_start}.pdf`; a.click(); URL.revokeObjectURL(a.href); setNote("Server PDF downloaded.");
    }catch(e){ setErr((e as Error).message+" — falling back to print: use Print / save as PDF."); window.print(); } finally{ setPdfBusy(null); } }
  async function emailReport(r:Report){ setEmailBusy(r.id); setNote(""); setErr("");
    try{ const res=await fetch("/api/reports/email",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({reportId:r.id})}); const d=await res.json(); if(!res.ok) throw new Error(d.error||"Email failed"); setNote("Weekly report emailed to your signed-in address (summary only).");
    }catch(e){ setErr((e as Error).message); } finally{ setEmailBusy(null); } }
  async function load(){ if(!sb||!user) return; const {data}=await sb.from("weekly_reports").select("*").order("created_at",{ascending:false}); setReports((data||[]) as Report[]); }
  useEffect(()=>{ load(); /* eslint-disable-next-line */ },[user]);
  async function generate(){ if(!sb||!user) return; setBusy(true); setErr("");
    const {start,end}=weekBounds(new Date());
    const [t,s,w,m]=await Promise.all([sb.from("tasks").select("*"),sb.from("study_sessions").select("*"),sb.from("workload_entries").select("*"),sb.from("mood_checkins").select("*")]);
    const r=weeklyReport({tasks:(t.data||[]) as never,study:(s.data||[]) as never,workload:(w.data||[]) as never,mood:(m.data||[]) as never,weekStart:start,weekEnd:end});
    const summary=`Week ${start} to ${end}: ${r.tasksCompleted}/${r.tasksTotal} tasks completed (${r.completionPct}%). Study: ${r.studyMinutes} minutes across ${r.studySessions} sessions. Workload: ${r.workloadHours}h (${r.workloadLevel}). Self-reported averages — mood: ${r.avgMood ?? "no data"}, stress: ${r.avgStress ?? "no data"}. Suggestion: ${r.suggestion} Focus for next week: finish remaining tasks, keep study sessions regular, and protect breaks.`;
    // One report per user per week: regenerating updates the existing row
    // instead of creating a duplicate (enforced by idx_weekly_reports_user_week_unique).
    const {error}=await sb.from("weekly_reports").upsert({user_id:user.id,week_start:start,week_end:end,summary,data:r},{onConflict:"user_id,week_start"});
    if(error) setErr(error.message); else { setCurrent(summary); load(); } setBusy(false); }
  return <AppShell title="Weekly insights & reports"><Glass>
    <p className="muted">Reports are generated from your real tasks, study, workload and (optional) self-reported mood data for the current week.</p>
    <p><button className="btn" onClick={generate} disabled={busy}>{busy?"Generating…":"Generate this week's report"}</button> <button className="btn btn-secondary" onClick={()=>window.print()}>Print / save as PDF</button></p>
    <p className="muted" style={{fontSize:".85rem"}}>Each saved report can be downloaded as a real server-generated PDF (Download PDF below). Print / save as PDF remains the fallback if the server PDF fails. Email delivery uses the configured provider only (EMAIL_PROVIDER=resend + RESEND_API_KEY); if none is configured, emailing returns a clear &quot;not configured&quot; error and no delivery is claimed — only the report summary is ever emailed, never conversations, memories or reflections.</p>
    {err&&<p className="error" role="alert">{err}</p>} {note&&<p className="success" role="status">{note}</p>} {current&&<div style={{whiteSpace:"pre-wrap"}}>{current}</div>}
    <h3>Report history</h3>
    {reports.length? <ul>{reports.map(r=><li key={r.id}><strong>{r.week_start} → {r.week_end}</strong><p style={{whiteSpace:"pre-wrap"}}>{r.summary}</p><p style={{display:"flex",gap:".5rem",flexWrap:"wrap"}}><button className="btn btn-secondary" onClick={()=>downloadPdf(r)} disabled={pdfBusy===r.id}>{pdfBusy===r.id?"Preparing PDF…":"Download PDF"}</button><button className="btn btn-secondary" onClick={()=>emailReport(r)} disabled={emailBusy===r.id}>{emailBusy===r.id?"Sending…":"Email this report"}</button></p></li>)}</ul> : <EmptyState text="No reports generated yet." />}
  </Glass></AppShell>;
}
