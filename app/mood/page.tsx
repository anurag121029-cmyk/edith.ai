"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell, Glass, EmptyState } from "@/components/ui";
import { useUser } from "@/lib/useUser";
import { moodTrend, stressSuggestion } from "@/lib/logic";
import { averageMoodByDay, checkinStreakLocal, localDayKey } from "@/lib/moodPatterns";
import BreathingExercise from "@/components/BreathingExercise";
import MorningCheckin from "@/components/MorningCheckin";
type Check={id:string;mood_score:number;stress_score:number;sleep_hours?:number|null;note?:string;created_at:string};
type AutoMood={moodScore:number;stressScore:number;confidence:number;confidenceLabel:string;sampleCount:number;stressHits:number;calmHits:number;source:string};
type MoodReading={auto:AutoMood|null;manualLatest:Check|null;manualRecentCount:number;reading:string;readingSource:string;updatedAt:string;disclaimer:string};
type MoodPatterns={averageMood:number|null;checkins28:number;daysCheckedIn:number;consistency:number;checkedInToday:boolean;checkinStreak:number;trend:{direction:string;delta:number|null;streak:number;volatility:number|null;thisWeekAvg:number|null;prevWeekAvg:number|null};bestWeekday:string|null;bestWeekdayMood:number|null;worstWeekday:string|null;worstWeekdayMood:number|null;mostStableWeekday:string|null;mostStableWeekdayStd:number|null;leastStableWeekday:string|null;leastStableWeekdayStd:number|null;volatility:number|null;moodRange:{min:number|null;max:number|null};correlation:{r:number|null;days:number;key:string;reading:string};hasData:boolean};
type MoodSummary={summary:string;source:"gemini"|"template"|"none";patterns:MoodPatterns;disclaimer:string};
const WEEKDAYS=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
function moodColor(avg:number){ if(avg>=7) return "#22c55e"; if(avg>=5) return "#f59e0b"; return "#ef4444"; }
export default function Page(){
  const { user, sb } = useUser();
  const [rows,setRows]=useState<Check[]>([]); const [mood,setMood]=useState(7); const [stress,setStress]=useState(4); const [note,setNote]=useState(""); const [err,setErr]=useState("");
  const [auto,setAuto]=useState<MoodReading|null>(null); const [autoErr,setAutoErr]=useState(""); const [autoBusy,setAutoBusy]=useState(false);
  const [summary,setSummary]=useState<MoodSummary|null>(null); const [sumErr,setSumErr]=useState(""); const [sumBusy,setSumBusy]=useState(false);
  const now=new Date(); const [calYear,setCalYear]=useState(now.getFullYear()); const [calMonth,setCalMonth]=useState(now.getMonth());
  const [selDay,setSelDay]=useState<string|null>(null);
  async function load(){ if(!sb||!user) return; const {data,error}=await sb.from("mood_checkins").select("*").order("created_at",{ascending:false}).limit(200); if(error) setErr(error.message); setRows((data||[]) as Check[]); }
  async function loadAuto(){ setAutoErr(""); setAutoBusy(true); try{ const res=await fetch("/api/mood"); const d=await res.json(); if(!res.ok) throw new Error(d.error||"Mood reading failed"); setAuto(d as MoodReading); }catch(e){ setAutoErr((e as Error).message); } finally{ setAutoBusy(false); } }
  async function loadSummary(){ setSumErr(""); setSumBusy(true); try{ const res=await fetch("/api/mood/summary"); const d=await res.json(); if(!res.ok) throw new Error(d.error||"Mood summary failed"); setSummary(d as MoodSummary); }catch(e){ setSumErr((e as Error).message); } finally{ setSumBusy(false); } }
  useEffect(()=>{ load(); loadAuto(); loadSummary(); /* eslint-disable-next-line */ },[user]);
  async function add(e:React.FormEvent){ e.preventDefault(); if(!sb||!user) return; const {error}=await sb.from("mood_checkins").insert({user_id:user.id,mood_score:mood,stress_score:stress,note:note||null}); if(error) setErr(error.message); else { setNote(""); load(); loadAuto(); loadSummary(); } }
  async function del(id:string){ if(!sb) return; if(!confirm("Delete this check-in?")) return; await sb.from("mood_checkins").delete().eq("id",id); load(); loadAuto(); loadSummary(); }
  const t=moodTrend(rows);
  const status=checkinStreakLocal(rows);
  const byDay=averageMoodByDay(rows);
  const daysInMonth=new Date(calYear,calMonth+1,0).getDate();
  const firstWeekday=new Date(calYear,calMonth,1).getDay();
  const monthName=new Date(calYear,calMonth,1).toLocaleDateString(undefined,{month:"long",year:"numeric"});
  function shiftMonth(delta:number){ let y=calYear; let m=calMonth+delta; if(m<0){m=11;y--;} if(m>11){m=0;y++;} setCalYear(y); setCalMonth(m); setSelDay(null); }
  const selRows=selDay?rows.filter(r=>localDayKey(new Date(r.created_at))===selDay):[];
  const p=summary?.patterns;
  return <AppShell title="Stress & mood check-ins">
  <Glass>
    <h3 style={{marginTop:0}}>Today</h3>
    {status.checkedInToday
      ? <p><strong>✓ Checked in today.</strong>{status.streak>1?` ${status.streak}-day check-in streak — keep it going.`:""}</p>
      : <p><strong>Not checked in yet today.</strong>{status.streak>0?` Your check-in streak is ${status.streak} day${status.streak===1?"":"s"} — check in below to keep it alive.`:" No streak yet — check in below to start one."}</p>}
    <p className="muted" style={{fontSize:".85rem"}}>A streak counts consecutive days with at least one check-in. These are your self-reported scores — estimates, not a diagnosis.</p>
  </Glass><div style={{height:12}} />
  <MorningCheckin /><div style={{height:12}} />
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
    <h3 style={{marginTop:0}}>Take 2 minutes to breathe</h3>
    <p className="muted">Box breathing — 4 seconds in, 4 hold, 4 out, 4 hold — whenever stress feels high. A short calming exercise, not medical advice.</p>
    <BreathingExercise />
    <p><Link className="btn btn-secondary" href="/relax">More guided sessions →</Link></p>
  </Glass><div style={{height:12}} />
  <Glass>
    <h3 style={{marginTop:0}}>Guided relaxation</h3>
    <p className="muted">Seven guided sessions — breathing, body scan, muscle relaxation and visualisation — with a player that talks you through each step, including a 60-second calm-down you can also start from the dashboard. Your practice is recorded so you can see it build up.</p>
    <p><Link className="btn" href="/relax">Open guided relaxation →</Link></p>
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
    <ul>{rows.map(r=><li key={r.id}>{new Date(r.created_at).toLocaleDateString()}: mood {r.mood_score}, stress {r.stress_score}{r.sleep_hours!==null&&r.sleep_hours!==undefined?`, slept about ${r.sleep_hours}h`:""}{r.note?` — ${r.note}`:""} <button className="btn btn-danger" onClick={()=>del(r.id)}>Delete</button></li>)}</ul></> : <EmptyState text="No check-ins yet." />}
    <p><Link className="btn btn-secondary" href="/journal">Write in your journal →</Link></p>
  </Glass><div style={{height:12}} />
  <Glass>
    <h3 style={{marginTop:0}}>Mood history</h3>
    <p className="muted">Each day is coloured by that day&apos;s average mood — green 7+, amber 5–6, red below 5. Blank days have no check-in. Tap a day to see its check-ins.</p>
    <div style={{display:"flex",gap:".5rem",alignItems:"center",marginBottom:".5rem"}}>
      <button className="btn btn-secondary" onClick={()=>shiftMonth(-1)} aria-label="Previous month">←</button>
      <strong style={{flex:1,textAlign:"center"}}>{monthName}</strong>
      <button className="btn btn-secondary" onClick={()=>shiftMonth(1)} aria-label="Next month">→</button>
    </div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4}} role="grid" aria-label={`Mood calendar for ${monthName}`}>
      {WEEKDAYS.map(d=><div key={d} style={{textAlign:"center",fontSize:".8rem",fontWeight:700}}>{d}</div>)}
      {Array.from({length:firstWeekday},(_,i)=><div key={`blank-${i}`} />)}
      {Array.from({length:daysInMonth},(_,i)=>{
        const day=i+1; const key=`${calYear}-${String(calMonth+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
        const avg=byDay.get(key);
        const selected=selDay===key;
        return <button key={key} type="button" onClick={()=>setSelDay(selected?null:key)} aria-label={`${key}${avg!==undefined?`, average mood ${avg} out of 10`:", no check-in"}`} style={{minHeight:44,borderRadius:8,border:selected?"2px solid var(--text)":"1px solid var(--glass-border)",background:avg===undefined?"transparent":moodColor(avg),color:avg===undefined?"inherit":"#fff",fontWeight:700,cursor:"pointer"}}>{day}{avg!==undefined&&<div style={{fontSize:".7rem",fontWeight:400}}>{avg}/10</div>}</button>;
      })}
    </div>
    {selDay&&<>
      <h4 style={{marginBottom:".3rem"}}>{new Date(`${selDay}T12:00:00`).toLocaleDateString(undefined,{weekday:"long",year:"numeric",month:"long",day:"numeric"})}</h4>
      {selRows.length? <ul>{selRows.map(r=><li key={r.id}>{new Date(r.created_at).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}: mood {r.mood_score}, stress {r.stress_score}{r.sleep_hours!==null&&r.sleep_hours!==undefined?`, slept about ${r.sleep_hours}h`:""}{r.note?` — ${r.note}`:""}</li>)}</ul> : <p className="muted">No check-in on this day.</p>}
    </>}
  </Glass><div style={{height:12}} />
  <Glass>
    <h3 style={{marginTop:0}}>Your mood patterns</h3>
    <p className="muted">Worked out from your own check-ins and app activity in the last 28 days — self-reported estimates, not a diagnosis.</p>
    {sumBusy&&!summary&&<p className="muted">Working out your mood patterns…</p>}
    {sumErr&&<p className="error" role="alert">{sumErr}</p>}
    {summary&&p&&!p.hasData&&<EmptyState text="Not enough mood data yet — add a few daily check-ins and your patterns, summary and mood × workload link will appear here." />}
    {summary&&p&&p.hasData&&<>
      <p style={{whiteSpace:"pre-wrap"}}>{summary.summary} <span className="muted">(via {summary.source})</span></p>
      <ul>
        <li><strong>Average mood:</strong> {p.averageMood}/10 · {p.checkins28} check-in{p.checkins28===1?"":"s"} on {p.daysCheckedIn} of the last 28 days ({Math.round(p.consistency*100)}% of days)</li>
        <li><strong>Trend:</strong> {p.trend.direction}{p.trend.delta!==null?` ${(Math.abs(p.trend.delta)/10).toFixed(1)} points on the 1–10 scale vs last week`:""}{p.trend.streak>=2?` · ${p.trend.streak}-day streak`:""}{p.trend.volatility!==null?` · day-to-day swing ${p.trend.volatility/10}`:""}</li>
        <li><strong>Best weekday:</strong> {p.bestWeekday??"—"}{p.bestWeekdayMood!==null?` (average mood ${p.bestWeekdayMood}/10)`:""} · <strong>Hardest:</strong> {p.worstWeekday??"—"}{p.worstWeekdayMood!==null?` (average mood ${p.worstWeekdayMood}/10)`:""}</li>
        <li><strong>Stability:</strong> mood ranged {p.moodRange.min}–{p.moodRange.max}/10{p.volatility!==null?` (day-to-day swing ${p.volatility})`:""}{p.mostStableWeekday?` · most stable: ${p.mostStableWeekday}${p.mostStableWeekdayStd!==null?` (swing ${p.mostStableWeekdayStd})`:""}`:""}{p.leastStableWeekday?` · least stable: ${p.leastStableWeekday}${p.leastStableWeekdayStd!==null?` (swing ${p.leastStableWeekdayStd})`:""}`:""}</li>
      </ul>
      <h4 style={{marginBottom:".3rem"}}>Mood × workload</h4>
      <p>{p.correlation.r!==null?<>Correlation <strong>r = {p.correlation.r}</strong> over {p.correlation.days} days with both mood and workload recorded.</>:<>No correlation value yet — {p.correlation.days} day{p.correlation.days===1?"":"s"} with both mood and workload recorded (7 needed).</>} {p.correlation.reading}</p>
      <p className="muted" style={{fontSize:".85rem"}}>{summary.disclaimer}</p>
    </>}
    <p><button className="btn btn-secondary" onClick={loadSummary} disabled={sumBusy}>↻ Refresh patterns &amp; summary</button></p>
  </Glass></AppShell>;
}
