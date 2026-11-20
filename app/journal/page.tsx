"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell, Glass, EmptyState } from "@/components/ui";
import { useUser } from "@/lib/useUser";
import { localDayKey } from "@/lib/moodPatterns";
type Entry={id:string;entry_date:string;title?:string|null;content:string;mood_score?:number|null;created_at:string};
export default function Page(){
  const { user, sb } = useUser();
  const [rows,setRows]=useState<Entry[]>([]); const [err,setErr]=useState("");
  const [entryDate,setEntryDate]=useState(localDayKey(new Date()));
  const [title,setTitle]=useState(""); const [content,setContent]=useState(""); const [mood,setMood]=useState("");
  async function load(){ if(!sb||!user) return; const {data,error}=await sb.from("journal_entries").select("*").order("entry_date",{ascending:false}).order("created_at",{ascending:false}).limit(100); if(error) setErr(error.message); setRows((data||[]) as Entry[]); }
  useEffect(()=>{ load(); /* eslint-disable-next-line */ },[user]);
  async function add(e:React.FormEvent){
    e.preventDefault(); if(!sb||!user) return;
    if(!content.trim()){ setErr("Write something first — an entry needs some text."); return; }
    const {error}=await sb.from("journal_entries").insert({user_id:user.id,entry_date:entryDate,title:title.trim()||null,content:content.trim(),mood_score:mood===""?null:Number(mood)});
    if(error) setErr(error.message); else { setTitle(""); setContent(""); setMood(""); setErr(""); load(); }
  }
  async function del(id:string){ if(!sb) return; if(!confirm("Delete this journal entry?")) return; await sb.from("journal_entries").delete().eq("id",id); load(); }
  return <AppShell title="Journal">
  <Glass>
    <p className="muted">Your journal is <strong>private to your account</strong>. Entries are never sent to Gemini, never used in any summary or briefing, and never shown anywhere except this page.</p>
    <form onSubmit={add}>
      <label htmlFor="jd">Date</label><input id="jd" className="input" type="date" value={entryDate} onChange={e=>setEntryDate(e.target.value)} />
      <label htmlFor="jt">Title (optional)</label><input id="jt" className="input" value={title} onChange={e=>setTitle(e.target.value)} placeholder="A title for today…" />
      <label htmlFor="jm">Mood (optional)</label>
      <select id="jm" className="input" value={mood} onChange={e=>setMood(e.target.value)}>
        <option value="">No mood attached</option>
        {Array.from({length:10},(_,i)=>i+1).map(n=><option key={n} value={n}>{n}/10</option>)}
      </select>
      <label htmlFor="jc">What happened today?</label><textarea id="jc" className="input" rows={6} value={content} onChange={e=>setContent(e.target.value)} placeholder="Write freely — this stays yours." />
      <p><button className="btn">Save entry</button></p>
    </form>
    {err&&<p className="error" role="alert">{err}</p>}
  </Glass><div style={{height:12}} />
  <Glass>
    <h3 style={{marginTop:0}}>Your entries</h3>
    {rows.length? <ul style={{listStyle:"none",padding:0,display:"grid",gap:"1rem"}}>{rows.map(r=><li key={r.id} style={{borderBottom:"1px solid var(--glass-border)",paddingBottom:"1rem"}}>
      <p style={{margin:"0 0 .3rem"}}><strong>{new Date(`${r.entry_date}T12:00:00`).toLocaleDateString(undefined,{weekday:"long",year:"numeric",month:"long",day:"numeric"})}</strong>{r.mood_score?` · mood ${r.mood_score}/10`:""}{r.title?` — ${r.title}`:""}</p>
      <p style={{whiteSpace:"pre-wrap",margin:"0 0 .5rem"}}>{r.content}</p>
      <button className="btn btn-danger" onClick={()=>del(r.id)}>Delete</button>
    </li>)}</ul> : <EmptyState text="No journal entries yet — write your first one above." />}
    <p><Link className="btn btn-secondary" href="/mood">← Back to mood</Link></p>
  </Glass></AppShell>;
}
