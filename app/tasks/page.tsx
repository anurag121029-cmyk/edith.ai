"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell, Glass, EmptyState } from "@/components/ui";
import { useUser } from "@/lib/useUser";
import { computeTaskReport, sessionMinutes } from "@/lib/taskReport";
type Task={id:string;title:string;description?:string;status:string;priority:string;category?:string;due_date?:string|null;start_time?:string|null;planned_minutes?:number|null;place?:string|null;reminder_at?:string|null;difficulty?:number|null;stress_after?:number|null;started_at?:string|null;completed_at?:string|null};
function toISO(local: string): string | null { if (!local) return null; const d = new Date(local); return Number.isNaN(d.getTime()) ? null : d.toISOString(); }
function toLocal(iso?: string | null): string { if (!iso) return ""; const d = new Date(iso); if (Number.isNaN(d.getTime())) return ""; const p = (n: number) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; }
function fmt(iso?: string | null): string { if (!iso) return ""; const d = new Date(iso); return Number.isNaN(d.getTime()) ? "" : d.toLocaleString(); }
export default function Page(){
  const { user, sb } = useUser();
  const [tasks,setTasks]=useState<Task[]>([]); const [err,setErr]=useState(""); const [filter,setFilter]=useState("all");
  const [form,setForm]=useState({title:"",priority:"medium",category:"general",due_date:"",start_time:"",planned_minutes:"",place:"",reminder_at:""});
  const [showReport,setShowReport]=useState<string|null>(null);
  async function load(){ if(!sb||!user) return; const {data,error}=await sb.from("tasks").select("*").order("due_date",{ascending:true}); if(error) setErr(error.message); setTasks((data||[]) as Task[]); }
  useEffect(()=>{ load(); /* eslint-disable-next-line */ },[user]);
  async function add(e:React.FormEvent){ e.preventDefault(); if(!sb||!user) return; const {error}=await sb.from("tasks").insert({user_id:user.id,title:form.title,priority:form.priority,category:form.category,due_date:form.due_date||null,start_time:toISO(form.start_time),planned_minutes:form.planned_minutes?Number(form.planned_minutes):null,place:form.place||null,reminder_at:toISO(form.reminder_at)}); if(error) setErr(error.message); else { setForm({title:"",priority:"medium",category:"general",due_date:"",start_time:"",planned_minutes:"",place:"",reminder_at:""}); load(); } }
  async function update(t:Task,patch:Partial<Task>){ if(!sb) return; const {error}=await sb.from("tasks").update(patch).eq("id",t.id); if(error) setErr(error.message); else load(); }
  async function del(id:string){ if(!sb) return; if(!confirm("Delete this task?")) return; await sb.from("tasks").delete().eq("id",id); load(); }
  const shown=tasks.filter(t=>filter==="all"?true:filter==="overdue"? t.status!=="done"&&t.due_date&&t.due_date<new Date().toISOString().slice(0,10) : t.status===filter);
  const now = Date.now();
  const reminders = tasks.filter(t=>t.status!=="done"&&t.reminder_at&&Date.parse(t.reminder_at)<=now+24*60*60*1000).sort((a,b)=>Date.parse(a.reminder_at||"")-Date.parse(b.reminder_at||""));
  return <AppShell title="Tasks"><Glass>
    {!user && <EmptyState text="Sign in to create and persist tasks in Supabase." />}
    {user && reminders.length>0 && <div style={{marginBottom:"1rem"}}>
      <h3 style={{marginTop:0}}>⏰ Reminders — coming up in the next 24 hours</h3>
      <ul style={{listStyle:"none",padding:0}}>{reminders.map(t=><li key={t.id} className="glass" style={{padding:".6rem",marginBottom:".4rem"}}>
        <strong>{t.title}</strong> <span className="muted">· remind at {fmt(t.reminder_at)}{t.place?` · ${t.place}`:""}{t.start_time?` · starts ${fmt(t.start_time)}`:""}</span>
        <span style={{float:"right"}}><Link className="btn btn-secondary" href={`/study?task=${t.id}`}>Start now →</Link></span>
      </li>)}</ul>
      <p className="muted" style={{fontSize:".85rem"}}>Reminders also pop up as a browser notification while the app is open (enable them below the page footer, or in your browser's site settings).</p>
    </div>}
    <form onSubmit={add} style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:".5rem"}}>
      <input className="input" aria-label="Task title" placeholder="Task title" required value={form.title} onChange={e=>setForm({...form,title:e.target.value})} />
      <select className="input" aria-label="Priority" value={form.priority} onChange={e=>setForm({...form,priority:e.target.value})}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select>
      <input className="input" aria-label="Category" placeholder="Category" value={form.category} onChange={e=>setForm({...form,category:e.target.value})} />
      <input className="input" aria-label="Due date" type="date" value={form.due_date} onChange={e=>setForm({...form,due_date:e.target.value})} />
      <label style={{fontSize:".85rem"}}>Start time<input className="input" aria-label="Start time" type="datetime-local" value={form.start_time} onChange={e=>setForm({...form,start_time:e.target.value})} /></label>
      <label style={{fontSize:".85rem"}}>Planned minutes<input className="input" aria-label="Planned minutes" type="number" min={1} max={1440} placeholder="e.g. 60" value={form.planned_minutes} onChange={e=>setForm({...form,planned_minutes:e.target.value})} /></label>
      <input className="input" aria-label="Place" placeholder="Place (e.g. library, home desk)" value={form.place} onChange={e=>setForm({...form,place:e.target.value})} />
      <label style={{fontSize:".85rem"}}>Remind me at<input className="input" aria-label="Reminder time" type="datetime-local" value={form.reminder_at} onChange={e=>setForm({...form,reminder_at:e.target.value})} /></label>
      <button className="btn">Add task</button>
    </form>
    <p className="muted" style={{fontSize:".85rem"}}>Plan it with a start time, place and reminder, then press Start on the task when it is time — the study page runs the timer and writes the report when you finish.</p>
    <p><label htmlFor="f">Filter</label><select id="f" className="input" style={{maxWidth:220}} value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">All</option><option value="todo">To do</option><option value="in_progress">In progress</option><option value="done">Done</option><option value="overdue">Overdue</option></select></p>
    {err&&<p className="error" role="alert">{err}</p>}
    {shown.length? <ul style={{listStyle:"none",padding:0}}>{shown.map(t=>{ const report = t.status==="done"&&t.started_at ? computeTaskReport({plannedMinutes:t.planned_minutes??null,actualMinutes:sessionMinutes(t.started_at,t.completed_at??undefined),difficulty:t.difficulty??null,stressAfter:t.stress_after??null}) : null; return <li key={t.id} className="glass" style={{padding:".7rem",marginBottom:".5rem"}}>
      <div style={{display:"flex",gap:".6rem",alignItems:"center",flexWrap:"wrap"}}>
        <input type="checkbox" aria-label={`Mark ${t.title} complete`} checked={t.status==="done"} onChange={e=>update(t,{status:e.target.checked?"done":"todo"})} />
        <span style={{flex:1,textDecoration:t.status==="done"?"line-through":"none"}}>{t.title} <span className="muted">· {t.priority} · {t.category||"general"}{t.due_date?` · due ${t.due_date}`:""}{t.start_time?` · starts ${fmt(t.start_time)}`:""}{t.planned_minutes?` · ${t.planned_minutes} min planned`:""}{t.place?` · ${t.place}`:""}{t.reminder_at?` · ⏰ ${fmt(t.reminder_at)}`:""}</span></span>
        {t.status!=="done" && <Link className="btn" href={`/study?task=${t.id}`}>▶ Start</Link>}
        {report && <button className="btn btn-secondary" onClick={()=>setShowReport(showReport===t.id?null:t.id)}>{showReport===t.id?"Hide report":"Report"}</button>}
        <button className="btn btn-secondary" onClick={()=>{ const title=prompt("Edit title",t.title); if(title) update(t,{title}); }}>Edit</button>
        <button className="btn btn-danger" onClick={()=>del(t.id)}>Delete</button>
      </div>
      {report && showReport===t.id && <div style={{marginTop:".6rem",borderTop:"1px solid rgba(127,127,127,.3)",paddingTop:".6rem"}}>
        <strong>Session report:</strong> {report.paceVerdict} Difficulty: {report.difficultyLabel||"—"} · Stress afterwards: {report.stressLabel||"—"}{report.stressAfter!==null?` (${report.stressAfter}/10)`:""}.
        <ul style={{margin:".4rem 0 0"}}>{report.lines.map((l,i)=><li key={i}>{l}</li>)}</ul>
        <p className="muted" style={{fontSize:".8rem"}}>{report.disclaimer}</p>
      </div>}
    </li>;})}</ul> : <EmptyState text="No tasks match this filter." />}
  </Glass></AppShell>;
}
