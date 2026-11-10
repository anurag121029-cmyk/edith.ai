"use client";
import { useEffect, useState } from "react";
import { AppShell, Glass, EmptyState } from "@/components/ui";
import { useUser } from "@/lib/useUser";
import { moodTrend, stressSuggestion } from "@/lib/logic";
type Check={id:string;mood_score:number;stress_score:number;note?:string;created_at:string};
type AutoMood={moodScore:number;stressScore:number;confidence:number;confidenceLabel:string;sampleCount:number;stressHits:number;calmHits:number;source:string};
type MoodReading={auto:AutoMood|null;manualLatest:Check|null;manualRecentCount:number;reading:string;readingSource:string;updatedAt:string;disclaimer:string};
export default function Page(){
  const { user, sb } = useUser();
  const [rows,setRows]=useState<Check[]>([]); const [mood,setMood]=useState(7); const [stress,setStress]=useState(4); const [note,setNote]=useState(""); const [err,setErr]=useState("");
  const [auto,setAuto]=useState<MoodReading|null>(null); const [autoErr,setAutoErr]=useState(""); const [autoBusy,setAutoBusy]=useState(false);
  async function load(){ if(!sb||!user) return; const {data,error}=await sb.from("mood_checkins").select("*").order("created_at",{ascending:false}).limit(30); if(error) setErr(error.message); setRows((data||[]) as Check[]); }
  async function loadAuto(){ setAutoErr(""); setAutoBusy(true); try{ const res=await fetch("/api/mood"); const d=await res.json(); if(!res.ok) throw new Error(d.error||"Mood reading failed"); setAuto(d as MoodReading); }catch(e){ setAutoErr((e as Error).message); } finally{ setAutoBusy(false); } }
  useEffect(()=>{ load(); loadAuto(); /* eslint-disable-next-line */ },[user]);
  async function add(e:React.FormEvent){ e.preventDefault(); if(!sb||!user) return; const {error}=await sb.from("mood_checkins").insert({user_id:user.id,mood_score:mood,stress_score:stress,note:note||null}); if(error) setErr(error.message); else { setNote(""); load(); loadAuto(); } }
  async function del(id:string){ if(!sb) return; if(!confirm("Delete this check-in?")) return; await sb.from("mood_checkins").delete().eq("id",id); load(); loadAuto(); }
  const t=moodTrend(rows);
  return <AppShell title="Stress & mood check-ins">
  <Glass>
    <h3 style={{marginTop:0}}>Your mood, read automatically</h3>
    <p className="muted">EDITH reads the mood of your recent chats (last 7 days) and works out a mood/stress pair from the words you used — so your stress score keeps working even when you skip a manual check-in. A manual check-in always overrides this reading in the stress score.</p>
    {autoBusy&&!auto&&<p className="muted">Reading your recent chats…</p>}
    {autoErr&&<p className="error" role="alert">{autoErr}</p>}
    {auto&&!auto.auto&&<EmptyState text="No recent chats to read your mood from — chat with EDITH and it will appear here." />}
    {auto?.auto&&<>
      <p><strong>Mood {auto.auto.moodScore}/10 · Stress {auto.auto.stressScore}/10</strong> <span className="muted">· confidence {auto.auto.confidenceLabel} ({Math.round(auto.auto.confidence*100)}%) · read from {auto.auto.sampleCount} recent chat message{auto.auto.sampleCount===1?"":"s"} ({auto.auto.stressHits} stress word{auto.auto.stressHits===1?"":"s"}, {auto.auto.calmHits} calm word{auto.auto.calmHits===1?"":"s"}) · source: {auto.auto.source}</span></p>
      {auto.reading&&<p style={{whiteSpace:"pre-wrap"}}>{auto.reading} <span className="muted">(via {auto.readingSource})</span></p>}
      <p className="muted" style={{fontSize:".85rem"}}>Updated {new Date(auto.updatedAt).toLocaleString()}{auto.manualLatest?` · latest manual check-in ${new Date(auto.manualLatest.created_at).toLocaleDateString()}: mood ${auto.manualLatest.mood_score}, stress ${auto.manualLatest.stress_score} — manual wins in the stress score.`:" · no manual check-in in the last 7 days — this automatic reading is driving the mood factor of your stress score."}</p>
      <p className="muted" style={{fontSize:".85rem"}}>{auto.disclaimer}</p>
    </>}
    <p><button className="btn btn-secondary" onClick={loadAuto} disabled={autoBusy}>↻ Refresh automatic reading</button></p>
  </Glass><div style={{height:12}} />
  <Glass>
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
