"use client";
import { useEffect, useState } from "react";
import { AppShell, Glass, EmptyState } from "@/components/ui";
import { useUser } from "@/lib/useUser";
type Session={id:string;topic:string;duration_minutes:number;notes?:string;created_at:string};
export default function Page(){
  const { user, sb } = useUser();
  const [sessions,setSessions]=useState<Session[]>([]); const [topic,setTopic]=useState(""); const [mins,setMins]=useState(25); const [question,setQuestion]=useState(""); const [answer,setAnswer]=useState(""); const [err,setErr]=useState(""); const [busy,setBusy]=useState(false);
  async function load(){ if(!sb||!user) return; const {data}=await sb.from("study_sessions").select("*").order("created_at",{ascending:false}).limit(20); setSessions((data||[]) as Session[]); }
  useEffect(()=>{ load(); /* eslint-disable-next-line */ },[user]);
  async function log(e:React.FormEvent){ e.preventDefault(); if(!sb||!user) return; const {error}=await sb.from("study_sessions").insert({user_id:user.id,topic,duration_minutes:mins,notes:answer||null}); if(error) setErr(error.message); else load(); }
  async function ask(e:React.FormEvent){ e.preventDefault(); setBusy(true); setErr(""); try{ const res=await fetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:`Explain step by step for a student, then give one practice question: ${question}`})}); const d=await res.json(); if(!res.ok) throw new Error(d.error); setAnswer(d.reply); }catch(e){ setErr((e as Error).message); } finally{ setBusy(false); } }
  return <AppShell title="Study assistant">
    <Glass><h3 style={{marginTop:0}}>Ask a study question</h3>
      <form onSubmit={ask}><label htmlFor="q">Question / topic</label><input id="q" className="input" value={question} onChange={e=>setQuestion(e.target.value)} required placeholder="e.g. Why does integration give area under a curve?" /><p><button className="btn" disabled={busy}>{busy?"Thinking…":"Explain"}</button></p></form>
      {err&&<p className="error" role="alert">{err}</p>} {answer&&<div style={{whiteSpace:"pre-wrap"}}>{answer}</div>}
    </Glass>
    <div style={{height:12}} />
    <Glass><h3 style={{marginTop:0}}>Log a study session</h3>
      <form onSubmit={log} style={{display:"flex",gap:".5rem",flexWrap:"wrap"}}><input className="input" style={{maxWidth:260}} aria-label="Topic" placeholder="Topic" value={topic} onChange={e=>setTopic(e.target.value)} required /><input className="input" style={{maxWidth:140}} aria-label="Minutes" type="number" min={1} max={1440} value={mins} onChange={e=>setMins(Number(e.target.value))} /><button className="btn">Log session</button></form>
      {sessions.length? <ul>{sessions.map(s=><li key={s.id}>{s.topic} — {s.duration_minutes} min <span className="muted">({new Date(s.created_at).toLocaleDateString()})</span></li>)}</ul> : <EmptyState text="No study sessions logged yet." />}
    </Glass></AppShell>;
}
