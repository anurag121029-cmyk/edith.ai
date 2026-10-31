"use client";
import { useEffect, useState } from "react";
import { AppShell, Glass, EmptyState } from "@/components/ui";
import { useUser } from "@/lib/useUser";
type Task={id:string;title:string;description?:string;status:string;priority:string;category?:string;due_date?:string|null};
export default function Page(){
  const { user, sb } = useUser();
  const [tasks,setTasks]=useState<Task[]>([]); const [err,setErr]=useState(""); const [filter,setFilter]=useState("all");
  const [form,setForm]=useState({title:"",priority:"medium",category:"general",due_date:""});
  async function load(){ if(!sb||!user) return; const {data,error}=await sb.from("tasks").select("*").order("due_date",{ascending:true}); if(error) setErr(error.message); setTasks((data||[]) as Task[]); }
  useEffect(()=>{ load(); /* eslint-disable-next-line */ },[user]);
  async function add(e:React.FormEvent){ e.preventDefault(); if(!sb||!user) return; const {error}=await sb.from("tasks").insert({user_id:user.id,title:form.title,priority:form.priority,category:form.category,due_date:form.due_date||null}); if(error) setErr(error.message); else { setForm({title:"",priority:"medium",category:"general",due_date:""}); load(); } }
  async function update(t:Task,patch:Partial<Task>){ if(!sb) return; const {error}=await sb.from("tasks").update(patch).eq("id",t.id); if(error) setErr(error.message); else load(); }
  async function del(id:string){ if(!sb) return; if(!confirm("Delete this task?")) return; await sb.from("tasks").delete().eq("id",id); load(); }
  const shown=tasks.filter(t=>filter==="all"?true:filter==="overdue"? t.status!=="done"&&t.due_date&&t.due_date<new Date().toISOString().slice(0,10) : t.status===filter);
  return <AppShell title="Tasks"><Glass>
    {!user && <EmptyState text="Sign in to create and persist tasks in Supabase." />}
    <form onSubmit={add} style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:".5rem"}}>
      <input className="input" aria-label="Task title" placeholder="Task title" required value={form.title} onChange={e=>setForm({...form,title:e.target.value})} />
      <select className="input" aria-label="Priority" value={form.priority} onChange={e=>setForm({...form,priority:e.target.value})}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select>
      <input className="input" aria-label="Category" placeholder="Category" value={form.category} onChange={e=>setForm({...form,category:e.target.value})} />
      <input className="input" aria-label="Due date" type="date" value={form.due_date} onChange={e=>setForm({...form,due_date:e.target.value})} />
      <button className="btn">Add task</button>
    </form>
    <p><label htmlFor="f">Filter</label><select id="f" className="input" style={{maxWidth:220}} value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">All</option><option value="todo">To do</option><option value="in_progress">In progress</option><option value="done">Done</option><option value="overdue">Overdue</option></select></p>
    {err&&<p className="error" role="alert">{err}</p>}
    {shown.length? <ul style={{listStyle:"none",padding:0}}>{shown.map(t=><li key={t.id} className="glass" style={{padding:".7rem",marginBottom:".5rem",display:"flex",gap:".6rem",alignItems:"center",flexWrap:"wrap"}}>
      <input type="checkbox" aria-label={`Mark ${t.title} complete`} checked={t.status==="done"} onChange={e=>update(t,{status:e.target.checked?"done":"todo"})} />
      <span style={{flex:1,textDecoration:t.status==="done"?"line-through":"none"}}>{t.title} <span className="muted">· {t.priority} · {t.category||"general"}{t.due_date?` · due ${t.due_date}`:""}</span></span>
      <button className="btn btn-secondary" onClick={()=>{ const title=prompt("Edit title",t.title); if(title) update(t,{title}); }}>Edit</button>
      <button className="btn btn-danger" onClick={()=>del(t.id)}>Delete</button></li>)}</ul> : <EmptyState text="No tasks match this filter." />}
  </Glass></AppShell>;
}
