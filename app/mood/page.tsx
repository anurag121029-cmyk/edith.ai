"use client";
import { useEffect, useState } from "react";
import { AppShell, Glass, EmptyState } from "@/components/ui";
import { useUser } from "@/lib/useUser";
import { moodTrend, stressSuggestion } from "@/lib/logic";
type Check={id:string;mood_score:number;stress_score:number;note?:string;created_at:string};
export default function Page(){
  const { user, sb } = useUser();
  const [rows,setRows]=useState<Check[]>([]); const [mood,setMood]=useState(7); const [stress,setStress]=useState(4); const [note,setNote]=useState(""); const [err,setErr]=useState("");
  async function load(){ if(!sb||!user) return; const {data,error}=await sb.from("mood_checkins").select("*").order("created_at",{ascending:false}).limit(30); if(error) setErr(error.message); setRows((data||[]) as Check[]); }
  useEffect(()=>{ load(); /* eslint-disable-next-line */ },[user]);
  async function add(e:React.FormEvent){ e.preventDefault(); if(!sb||!user) return; const {error}=await sb.from("mood_checkins").insert({user_id:user.id,mood_score:mood,stress_score:stress,note:note||null}); if(error) setErr(error.message); else { setNote(""); load(); } }
  async function del(id:string){ if(!sb) return; if(!confirm("Delete this check-in?")) return; await sb.from("mood_checkins").delete().eq("id",id); load(); }
  const t=moodTrend(rows);
  return <AppShell title="Stress & mood check-ins"><Glass>
    <p className="muted">These are <strong>your self-reported scores</strong> — EDITH does not detect or diagnose your psychological state. You can skip check-ins or delete records any time. This data is private to your account and is not shared.</p>
    <form onSubmit={add}>
      <label htmlFor="m">Mood: {mood}/10</label><input id="m" type="range" min={1} max={10} value={mood} onChange={e=>setMood(Number(e.target.value))} />
      <label htmlFor="s">Stress: {stress}/10</label><input id="s" type="range" min={1} max={10} value={stress} onChange={e=>setStress(Number(e.target.value))} />
      <label htmlFor="n">Optional note</label><input id="n" className="input" value={note} onChange={e=>setNote(e.target.value)} />
      <p><button className="btn">Save check-in</button></p>
    </form>
    {err&&<p className="error" role="alert">{err}</p>}
    {rows.length? <><p>Average mood {t.avgMood}/10 · average stress {t.avgStress}/10. {stressSuggestion(t.avgStress)}</p>
    <ul>{rows.map(r=><li key={r.id}>{new Date(r.created_at).toLocaleDateString()}: mood {r.mood_score}, stress {r.stress_score}{r.note?` — ${r.note}`:""} <button className="btn btn-danger" onClick={()=>del(r.id)}>Delete</button></li>)}</ul></> : <EmptyState text="No check-ins yet." />}
  </Glass></AppShell>;
}
