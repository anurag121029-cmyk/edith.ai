"use client";
import { useEffect, useState } from "react";
import { AppShell, Glass, EmptyState } from "@/components/ui";
import { useUser } from "@/lib/useUser";
import { searchMemories } from "@/lib/logic";
type Mem={id:string;title:string;content:string;category:string};
const BLOCKED=/password|api[_ ]?key|secret|token|credit card/i;
export default function Page(){
  const { user, sb } = useUser();
  const [rows,setRows]=useState<Mem[]>([]); const [err,setErr]=useState(""); const [title,setTitle]=useState(""); const [content,setContent]=useState(""); const [cat,setCat]=useState("preference");
  const [enabled,setEnabled]=useState(true);
  const [search,setSearch]=useState("");
  const visible = searchMemories(rows, search);
  async function load(){ if(!sb||!user) return; const [m,p]=await Promise.all([ sb.from("memories").select("*").order("created_at",{ascending:false}), sb.from("profiles").select("preferences").eq("id",user.id).single() ]); setRows((m.data||[]) as Mem[]); const prefs=(p.data?.preferences||{}) as {memory_enabled?:boolean}; setEnabled(prefs.memory_enabled!==false); }
  useEffect(()=>{ load(); /* eslint-disable-next-line */ },[user]);
  async function add(e:React.FormEvent){ e.preventDefault(); if(BLOCKED.test(content)||BLOCKED.test(title)){ setErr("Please don't store passwords, keys or secrets in memory."); return; } if(!sb||!user) return; const {error}=await sb.from("memories").insert({user_id:user.id,title,content,category:cat}); if(error) setErr(error.message); else { setTitle(""); setContent(""); load(); } }
  async function del(id:string){ if(!sb) return; await sb.from("memories").delete().eq("id",id); load(); }
  async function clearAll(){ if(!sb||!user) return; if(!confirm("Delete ALL saved memories? This cannot be undone.")) return; await sb.from("memories").delete().eq("user_id",user.id); load(); }
  async function toggle(on:boolean){ setEnabled(on); if(!sb||!user) return; const {data}=await sb.from("profiles").select("preferences").eq("id",user.id).single(); const prefs={...((data?.preferences||{}) as object),memory_enabled:on}; await sb.from("profiles").update({preferences:prefs}).eq("id",user.id); }
  return <AppShell title="Remember My Context"><Glass>
    <p className="muted">Only memories you explicitly save here are stored, only for your account, and only used when memory is enabled. Never store passwords or secrets.</p>
    <label style={{display:"flex",gap:".5rem",alignItems:"center"}}><input type="checkbox" checked={enabled} onChange={e=>toggle(e.target.checked)} /> Memory enabled</label>
    <form onSubmit={add} style={{marginTop:"1rem"}}>
      <label htmlFor="t">Title</label><input id="t" className="input" value={title} onChange={e=>setTitle(e.target.value)} required />
      <label htmlFor="c">What should EDITH remember?</label><textarea id="c" className="input" rows={3} value={content} onChange={e=>setContent(e.target.value)} required />
      <label htmlFor="cat">Category</label><select id="cat" className="input" value={cat} onChange={e=>setCat(e.target.value)}><option value="goal">Goal / project</option><option value="preference">Preference</option><option value="learning">Learning</option><option value="task">Task context</option></select>
      <p><button className="btn" disabled={!enabled}>Save memory</button> <button type="button" className="btn btn-danger" onClick={clearAll}>Clear all memory</button></p>
    </form>
    {err&&<p className="error" role="alert">{err}</p>}
    <label htmlFor="mem-search">Search memories</label><input id="mem-search" className="input" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search by title, content or category…" />
    {search.trim() && <p className="muted" role="status">{visible.length} match{visible.length===1?"":"es"} for “{search.trim()}”.</p>}
    {visible.length? <ul style={{listStyle:"none",padding:0}}>{visible.map(r=><li key={r.id} className="glass" style={{padding:".7rem",marginBottom:".5rem"}}><strong>{r.title}</strong> <span className="muted">({r.category})</span><p style={{margin:".3rem 0"}}>{r.content}</p><button className="btn btn-secondary" onClick={()=>{ const c=prompt("Edit memory",r.content); if(c) sb?.from("memories").update({content:c}).eq("id",r.id).then(()=>load()); }}>Edit</button> <button className="btn btn-danger" onClick={()=>del(r.id)}>Delete</button></li>)}</ul> : <EmptyState text={rows.length ? "No memories match that search." : "No memories saved yet."} />}
  </Glass></AppShell>;
}
