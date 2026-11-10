"use client";
import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { AppShell, Glass, EmptyState } from "@/components/ui";
import { useUser } from "@/lib/useUser";
import { computeTaskReport, sessionMinutes, type TaskReport } from "@/lib/taskReport";

type Session={id:string;topic:string;duration_minutes:number;notes?:string;created_at:string};
type OpenTask={id:string;title:string;place?:string|null;planned_minutes?:number|null;start_time?:string|null;status:string};
type Running={taskId:string|null;topic:string;startedAt:string;pausedMs:number;pausedAt:string|null};
const LS_KEY="edith-running-session";

function fmtElapsed(ms:number): string {
  const s=Math.max(0,Math.floor(ms/1000));
  const h=Math.floor(s/3600), m=Math.floor((s%3600)/60), sec=s%60;
  const p=(n:number)=>String(n).padStart(2,"0");
  return h>0?`${h}:${p(m)}:${p(sec)}`:`${p(m)}:${p(sec)}`;
}

function StudyInner(){
  const params=useSearchParams();
  const { user, sb } = useUser();
  const [sessions,setSessions]=useState<Session[]>([]); const [topic,setTopic]=useState(""); const [mins,setMins]=useState(25); const [question,setQuestion]=useState(""); const [answer,setAnswer]=useState(""); const [err,setErr]=useState(""); const [busy,setBusy]=useState(false);
  const [openTasks,setOpenTasks]=useState<OpenTask[]>([]);
  const [selectedTaskId,setSelectedTaskId]=useState<string>("");
  const [running,setRunning]=useState<Running|null>(null);
  const [savedRun,setSavedRun]=useState<Running|null>(null);
  const [now,setNow]=useState(Date.now());
  const [finishing,setFinishing]=useState(false);
  const [difficulty,setDifficulty]=useState(3); const [stressAfter,setStressAfter]=useState(5); const [note,setNote]=useState("");
  const [report,setReport]=useState<TaskReport|null>(null);
  const [saving,setSaving]=useState(false);
  const startedRef=useRef(false);

  async function load(){ if(!sb||!user) return; const {data}=await sb.from("study_sessions").select("*").order("created_at",{ascending:false}).limit(20); setSessions((data||[]) as Session[]); const {data:tasks}=await sb.from("tasks").select("id,title,place,planned_minutes,start_time,status").neq("status","done").order("due_date",{ascending:true}); setOpenTasks((tasks||[]) as OpenTask[]); }
  useEffect(()=>{ load(); /* eslint-disable-next-line */ },[user]);
  // Resume a session that survived a closed tab.
  useEffect(()=>{ try{ const raw=localStorage.getItem(LS_KEY); if(raw) setSavedRun(JSON.parse(raw) as Running); }catch{ /* no saved session */ } },[]);
  // Pre-fill from ?task=<id> once, after tasks load.
  useEffect(()=>{ const id=params.get("task"); if(!id||startedRef.current) return; startedRef.current=true; setSelectedTaskId(id); (async()=>{ if(!sb) return; const {data}=await sb.from("tasks").select("id,title,place,planned_minutes,start_time,status").eq("id",id).single(); if(data){ setTopic((data as OpenTask).title); } })(); /* eslint-disable-next-line */ },[params,sb]);
  // Live tick while a session is running and not paused.
  useEffect(()=>{ if(!running||running.pausedAt) return; const t=setInterval(()=>setNow(Date.now()),1000); return ()=>clearInterval(t); },[running]);
  // Persist the running session so it survives a closed tab.
  useEffect(()=>{ if(running) { try{ localStorage.setItem(LS_KEY,JSON.stringify(running)); }catch{ /* storage unavailable */ } } },[running]);
  // Freeze the timer when the tab closes mid-session: the time the tab was
  // closed must not count as study time. On unload, bank the elapsed time
  // into pausedMs and mark the session paused, so Resume continues from
  // the true elapsed time instead of counting the closed-tab gap.
  const runningRef=useRef<Running|null>(null);
  useEffect(()=>{ runningRef.current=running; },[running]);
  useEffect(()=>{ const onUnload=()=>{ const r=runningRef.current; if(!r||r.pausedAt) return; try{ localStorage.setItem(LS_KEY,JSON.stringify({...r,pausedMs:r.pausedMs+(Date.now()-Date.parse(r.startedAt)),pausedAt:new Date().toISOString()})); }catch{ /* storage unavailable */ } }; window.addEventListener("beforeunload",onUnload); return ()=>window.removeEventListener("beforeunload",onUnload); },[]);

  const selectedTask=openTasks.find(t=>t.id===selectedTaskId)||null;
  const elapsedMs=running? running.pausedMs + (running.pausedAt?0:now-Date.parse(running.startedAt)) : 0;

  function startSession(r: Running){
    setRunning(r); setSavedRun(null); setReport(null); setFinishing(false);
    if(r.taskId&&sb) void sb.from("tasks").update({status:"in_progress",started_at:r.startedAt}).eq("id",r.taskId);
  }
  function start(){ const t=(selectedTask?.title||topic).trim(); if(!t){ setErr("Pick a task or type a topic first."); return; } setErr(""); startSession({taskId:selectedTaskId||null,topic:t,startedAt:new Date().toISOString(),pausedMs:0,pausedAt:null}); }
  function pause(){ if(!running||running.pausedAt) return; setRunning({...running,pausedAt:new Date().toISOString()}); }
  function resume(){ if(!running||!running.pausedAt) return; const extra=Date.now()-Date.parse(running.pausedAt); setRunning({...running,pausedMs:running.pausedMs+extra,pausedAt:null}); }
  function resumeSaved(){ if(!savedRun) return; // Saved runs are always paused (paused by the user, or frozen by beforeunload). If one somehow has no pausedAt, freeze it at the banked time so the closed-tab gap is never counted as study time.
    const r=savedRun.pausedAt? savedRun : {...savedRun,pausedAt:new Date().toISOString()};
    setRunning(r); setSavedRun(null); }
  function discardSaved(){ setSavedRun(null); try{ localStorage.removeItem(LS_KEY); }catch{ /* ignore */ } }

  async function finish(e:React.FormEvent){
    e.preventDefault(); if(!running||!sb||!user) return;
    setSaving(true); setErr("");
    const endedAt=new Date().toISOString();
    const actual=sessionMinutes(running.startedAt,endedAt);
    const planned=selectedTask?.planned_minutes??null;
    try{
      const {error:se}=await sb.from("task_sessions").insert({user_id:user.id,task_id:running.taskId,topic:running.topic,started_at:running.startedAt,ended_at:endedAt,duration_minutes:actual,difficulty,stress_after:stressAfter,notes:note||null});
      if(se) throw new Error(se.message);
      if(actual>=1){ const {error:ste}=await sb.from("study_sessions").insert({user_id:user.id,topic:running.topic,duration_minutes:actual,notes:note||null}); if(ste) throw new Error(ste.message); }
      if(running.taskId){ const {error:te}=await sb.from("tasks").update({status:"done",completed_at:endedAt,difficulty,stress_after:stressAfter}).eq("id",running.taskId); if(te) throw new Error(te.message); }
      setReport(computeTaskReport({plannedMinutes:planned,actualMinutes:actual,difficulty,stressAfter}));
      setRunning(null); setFinishing(false); setNote("");
      try{ localStorage.removeItem(LS_KEY); }catch{ /* ignore */ }
      load();
    }catch(er){ setErr((er as Error).message); } finally{ setSaving(false); }
  }

  async function log(e:React.FormEvent){ e.preventDefault(); if(!sb||!user) return; const {error}=await sb.from("study_sessions").insert({user_id:user.id,topic,duration_minutes:mins,notes:answer||null}); if(error) setErr(error.message); else load(); }
  async function ask(e:React.FormEvent){ e.preventDefault(); setBusy(true); setErr(""); try{ const res=await fetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:`Explain step by step for a student, then give one practice question: ${question}`})}); const d=await res.json(); if(!res.ok) throw new Error(d.error); setAnswer(d.reply); }catch(e){ setErr((e as Error).message); } finally{ setBusy(false); } }

  return <>
    <Glass><h3 style={{marginTop:0}}>Ask a study question</h3>
      <form onSubmit={ask}><label htmlFor="q">Question / topic</label><input id="q" className="input" value={question} onChange={e=>setQuestion(e.target.value)} required placeholder="e.g. Why does integration give area under a curve?" /><p><button className="btn" disabled={busy}>{busy?"Thinking…":"Explain"}</button></p></form>
      {err&&<p className="error" role="alert">{err}</p>} {answer&&<div style={{whiteSpace:"pre-wrap"}}>{answer}</div>}
    </Glass>
    <div style={{height:12}} />

    {/* ---- Task / study session flow: plan → start → finish → report ---- */}
    <Glass><h3 style={{marginTop:0}}>Start a task or study session</h3>
      {savedRun && !running && <div className="glass" style={{padding:".7rem",marginBottom:".7rem"}}>
        <strong>⏸ You have a session in progress:</strong> {savedRun.topic} — started {new Date(savedRun.startedAt).toLocaleString()}.
        <p style={{display:"flex",gap:".5rem",margin:".5rem 0 0"}}><button className="btn" onClick={resumeSaved}>Resume session</button><button className="btn btn-secondary" onClick={discardSaved}>Discard it</button></p>
      </div>}
      {!running && <>
        <p className="muted" style={{fontSize:".9rem"}}>Pick a planned task (with its start time, place and reminder from the Tasks page) or type a free topic, then press Start. The timer runs here; finish it and you get a report on how it went.</p>
        <div style={{display:"flex",gap:".5rem",flexWrap:"wrap"}}>
          <select className="input" style={{maxWidth:300}} aria-label="Pick a planned task" value={selectedTaskId} onChange={e=>{ setSelectedTaskId(e.target.value); const t=openTasks.find(x=>x.id===e.target.value); if(t) setTopic(t.title); }}>
            <option value="">— Pick a planned task —</option>
            {openTasks.map(t=><option key={t.id} value={t.id}>{t.title}{t.place?` · ${t.place}`:""}{t.planned_minutes?` · ${t.planned_minutes} min planned`:""}</option>)}
          </select>
          <input className="input" style={{maxWidth:260}} aria-label="Topic" placeholder="Or type a topic" value={topic} onChange={e=>{ setTopic(e.target.value); setSelectedTaskId(""); }} />
          <button className="btn" onClick={start} disabled={!user}>▶ Start</button>
        </div>
        {selectedTask && <p className="muted" style={{fontSize:".9rem"}}>Planned: {selectedTask.planned_minutes?`${selectedTask.planned_minutes} minutes`:"no time planned"}{selectedTask.place?` · at ${selectedTask.place}`:""}{selectedTask.start_time?` · from ${new Date(selectedTask.start_time).toLocaleString()}`:""}</p>}
        <p><Link className="btn btn-secondary" href="/tasks">Plan a task first →</Link></p>
      </>}
      {running && <>
        <div style={{textAlign:"center",padding:".5rem 0"}}>
          <div style={{fontSize:"3rem",fontWeight:800,lineHeight:1}}>{fmtElapsed(elapsedMs)}</div>
          <p style={{margin:".4rem 0 0"}}><strong>{running.topic}</strong>{selectedTask?.place?` · ${selectedTask.place}`:""}{selectedTask?.planned_minutes?` · planned ${selectedTask.planned_minutes} min`:""}</p>
          <p className="muted" style={{fontSize:".85rem",margin:".2rem 0 0"}}>Started {new Date(running.startedAt).toLocaleString()}{running.pausedAt?" · ⏸ paused":" · running"}</p>
        </div>
        <p style={{display:"flex",gap:".5rem",flexWrap:"wrap",justifyContent:"center"}}>
          {running.pausedAt
            ? <button className="btn" onClick={resume}>▶ Resume</button>
            : <button className="btn btn-secondary" onClick={pause}>⏸ Pause</button>}
          <button className="btn" onClick={()=>setFinishing(true)}>■ End & finish</button>
        </p>
        {finishing && <form onSubmit={finish} style={{marginTop:"1rem",borderTop:"1px solid rgba(127,127,127,.3)",paddingTop:"1rem"}}>
          <h4 style={{marginTop:0}}>How did it go?</h4>
          <p><label htmlFor="diff">How difficult was it? (1 = very easy … 5 = very hard)</label><br /><input id="diff" className="input" style={{maxWidth:120}} type="number" min={1} max={5} value={difficulty} onChange={e=>setDifficulty(Number(e.target.value))} required /></p>
          <p><label htmlFor="stress">How stressful did it feel afterwards? (1 = calm … 10 = very stressed)</label><br /><input id="stress" className="input" style={{maxWidth:120}} type="number" min={1} max={10} value={stressAfter} onChange={e=>setStressAfter(Number(e.target.value))} required /></p>
          <p><label htmlFor="note">Note (optional)</label><br /><input id="note" className="input" value={note} onChange={e=>setNote(e.target.value)} placeholder="What helped / what got in the way?" /></p>
          <p style={{display:"flex",gap:".5rem"}}><button className="btn" disabled={saving}>{saving?"Saving…":"Save session & show report"}</button><button type="button" className="btn btn-secondary" onClick={()=>setFinishing(false)}>Keep going</button></p>
        </form>}
      </>}
      {report && <div style={{marginTop:"1rem",borderTop:"1px solid rgba(127,127,127,.3)",paddingTop:"1rem"}}>
        <h4 style={{marginTop:0}}>📋 Session report</h4>
        <p><strong>{report.paceVerdict}</strong> Difficulty: {report.difficultyLabel||"—"} · Stress afterwards: {report.stressLabel||"—"}{report.stressAfter!==null?` (${report.stressAfter}/10)`:""}.</p>
        <ul>{report.lines.map((l,i)=><li key={i}>{l}</li>)}</ul>
        <p className="muted" style={{fontSize:".85rem"}}>{report.disclaimer}</p>
      </div>}
      {err&&<p className="error" role="alert">{err}</p>}
    </Glass>
    <div style={{height:12}} />

    <Glass><h3 style={{marginTop:0}}>Log a study session</h3>
      <form onSubmit={log} style={{display:"flex",gap:".5rem",flexWrap:"wrap"}}><input className="input" style={{maxWidth:260}} aria-label="Topic" placeholder="Topic" value={topic} onChange={e=>setTopic(e.target.value)} required /><input className="input" style={{maxWidth:140}} aria-label="Minutes" type="number" min={1} max={1440} value={mins} onChange={e=>setMins(Number(e.target.value))} /><button className="btn">Log session</button></form>
      {sessions.length? <ul>{sessions.map(s=><li key={s.id}>{s.topic} — {s.duration_minutes} min <span className="muted">({new Date(s.created_at).toLocaleDateString()})</span></li>)}</ul> : <EmptyState text="No study sessions logged yet." />}
    </Glass>
  </>;
}

export default function Page(){
  return <AppShell title="Study assistant"><Suspense fallback={<Glass><p className="muted">Loading…</p></Glass>}><StudyInner /></Suspense></AppShell>;
}
