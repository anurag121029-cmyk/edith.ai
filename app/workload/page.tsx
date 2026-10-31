"use client";
import { useEffect, useState } from "react";
import { AppShell, Glass, EmptyState } from "@/components/ui";
import { useUser } from "@/lib/useUser";
import { workloadSummary } from "@/lib/logic";
type Entry={id:string;title:string;hours:number;intensity:number;category?:string;due_date?:string|null;created_at:string};
export default function Page(){
  const { user, sb } = useUser();
  const [rows,setRows]=useState<Entry[]>([]); const [err,setErr]=useState("");
  const [form,setForm]=useState({title:"",hours:2,intensity:5,category:"work"});
  async function load(){ if(!sb||!user) return; const {data,error}=await sb.from("workload_entries").select("*").order("created_at",{ascending:false}).limit(50); if(error) setErr(error.message); setRows((data||[]) as Entry[]); }
  useEffect(()=>{ load(); /* eslint-disable-next-line */ },[user]);
  async function add(e:React.FormEvent){ e.preventDefault(); if(!sb||!user) return; const {error}=await sb.from("workload_entries").insert({user_id:user.id,...form}); if(error) setErr(error.message); else { setForm({title:"",hours:2,intensity:5,category:"work"}); load(); } }
  async function del(id:string){ if(!sb) return; await sb.from("workload_entries").delete().eq("id",id); load(); }
  const s=workloadSummary(rows);
  return <AppShell title="Workload analyzer"><Glass>
    <form onSubmit={add} style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:".5rem"}}>
      <input className="input" aria-label="Entry title" placeholder="e.g. Essay drafting" value={form.title} onChange={e=>setForm({...form,title:e.target.value})} required />
      <input className="input" aria-label="Hours" type="number" step="0.5" min={0} max={24} value={form.hours} onChange={e=>setForm({...form,hours:Number(e.target.value)})} />
      <label style={{margin:0}}>Intensity {form.intensity}/10<input aria-label="Intensity" type="range" min={1} max={10} value={form.intensity} onChange={e=>setForm({...form,intensity:Number(e.target.value)})} /></label>
      <input className="input" aria-label="Category" value={form.category} onChange={e=>setForm({...form,category:e.target.value})} />
      <button className="btn">Add entry</button>
    </form>
    {err&&<p className="error" role="alert">{err}</p>}
    {rows.length? <><p><strong>Summary:</strong> {s.totalHours}h total · average intensity {s.avgIntensity}/10 · level <strong>{s.level}</strong>. Break suggestion: {s.level==="high"?"Take a real break today and defer anything non-urgent.":s.level==="moderate"?"Schedule short breaks between blocks.":"Your logged load looks manageable."}</p>
    <ul>{rows.map(r=><li key={r.id}>{r.title} — {r.hours}h, intensity {r.intensity}/10 <button className="btn btn-danger" onClick={()=>del(r.id)}>Delete</button></li>)}</ul></> : <EmptyState text="No workload entries yet — log your first above." />}
  </Glass></AppShell>;
}
