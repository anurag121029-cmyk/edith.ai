"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell, Glass, EmptyState } from "@/components/ui";
import { useUser } from "@/lib/useUser";
import { taskCompletion, tasksDueToday, workloadSummary, moodTrend, stressSuggestion, type TaskLike } from "@/lib/logic";
export default function Page(){
  const { user, sb, loading } = useUser();
  const [data,setData]=useState<{tasks:TaskLike[]; convs:{id:string;title:string}[]; mood:{mood_score:number;stress_score:number;created_at:string}[]; workload:{hours:number;intensity:number;created_at:string}[]}|null>(null);
  const [err,setErr]=useState("");
  useEffect(()=>{ if(!user||!sb) return; (async()=>{
    const [t,c,m,w]=await Promise.all([ sb.from("tasks").select("*").order("due_date",{ascending:true}), sb.from("conversations").select("id,title,created_at").order("created_at",{ascending:false}).limit(5), sb.from("mood_checkins").select("*").order("created_at",{ascending:false}).limit(14), sb.from("workload_entries").select("*").order("created_at",{ascending:false}).limit(30) ]);
    if(t.error) setErr(t.error.message);
    setData({ tasks:(t.data||[]) as TaskLike[], convs:(c.data||[]) as {id:string;title:string}[], mood:(m.data||[]) as never, workload:(w.data||[]) as never });
  })(); },[user,sb]);
  const today=new Date().toISOString().slice(0,10);
  return <AppShell title="Dashboard">
    {loading && <p className="muted">Loading…</p>}
    {!loading && !user && <Glass><EmptyState text="Sign in to see your personal dashboard. All numbers here come from your own database records." /><p><Link className="btn" href="/login">Log in</Link></p></Glass>}
    {err && <p className="error" role="alert">{err}</p>}
    {data && (()=>{ const comp=taskCompletion(data.tasks); const due=tasksDueToday(data.tasks,today); const wl=workloadSummary(data.workload); const mt=moodTrend(data.mood); return (
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))",gap:"1rem"}}>
      <Glass><h3 style={{marginTop:0}}>Today&apos;s tasks</h3>{due.length? <ul>{due.map((t,i)=><li key={i}>{(t as {title?:string}).title||"Task"}</li>)}</ul> : <EmptyState text="No tasks due today." />}<p className="muted">{comp.done}/{comp.total} tasks complete ({comp.pct}%)</p><Link href="/tasks">Open tasks →</Link></Glass>
      <Glass><h3 style={{marginTop:0}}>Workload</h3>{data.workload.length? <><p>{wl.totalHours}h logged · average intensity {wl.avgIntensity}/10 · level: {wl.level}</p></> : <EmptyState text="No workload entries yet." />}<Link href="/workload">Log workload →</Link></Glass>
      <Glass><h3 style={{marginTop:0}}>Mood & stress (self-reported)</h3>{mt.count? <><p>Average mood {mt.avgMood}/10 · stress {mt.avgStress}/10</p><p className="muted">{stressSuggestion(mt.avgStress)}</p></> : <EmptyState text="No check-ins yet." />}<Link href="/mood">Check in →</Link></Glass>
      <Glass><h3 style={{marginTop:0}}>Recent conversations</h3>{data.convs.length? <ul>{data.convs.map(c=><li key={c.id}>{c.title}</li>)}</ul> : <EmptyState text="No conversations yet." />}<Link href="/chat">Chat with EDITH →</Link></Glass>
    </div>); })()}
  </AppShell>;
}
