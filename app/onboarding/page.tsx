"use client";
import { useEffect, useState } from "react";
import { AppShell, Glass } from "@/components/ui";
import { useUser } from "@/lib/useUser";
export default function Page(){
  const { user, sb } = useUser();
  const [name,setName]=useState(""); const [goals,setGoals]=useState(""); const [style,setStyle]=useState("balanced"); const [msg,setMsg]=useState(""); const [err,setErr]=useState("");
  useEffect(()=>{ if(user&&sb){ sb.from("profiles").select("*").eq("id",user.id).single().then(({data})=>{ if(data){ setName(data.display_name||""); setGoals(data.goals||""); const p=(data.preferences||{}) as {response_style?:string}; if(p.response_style) setStyle(p.response_style); }}); } },[user,sb]);
  async function save(e:React.FormEvent){ e.preventDefault(); if(!sb||!user){ setErr("You must be signed in with Supabase configured."); return; }
    // Upsert repairs a missing profile for existing users (trigger normally creates it).
    const {error}=await sb.from("profiles").upsert({ id:user.id, email:user.email, display_name:name, goals, preferences:{ response_style:style } });
    if(error) setErr(error.message); else { setMsg("Profile saved."); setTimeout(()=>{ window.location.href="/dashboard"; },600); } }
  return <AppShell title="Set up your profile"><Glass>
    <p className="muted">Your profile ID comes from Supabase Auth automatically — you never type a UUID. Saving here also repairs a missing profile row.</p>
    <form onSubmit={save}>
      <label htmlFor="n">Display name</label><input id="n" className="input" value={name} onChange={e=>setName(e.target.value)} />
      <label htmlFor="g">Your goals / ongoing projects</label><textarea id="g" className="input" rows={3} value={goals} onChange={e=>setGoals(e.target.value)} />
      <label htmlFor="s">Preferred response style</label><select id="s" className="input" value={style} onChange={e=>setStyle(e.target.value)}><option value="concise">Concise</option><option value="balanced">Balanced</option><option value="detailed">Detailed, step-by-step</option></select>
      <p><button className="btn">Save and go to dashboard</button></p>
    </form>{err&&<p className="error" role="alert">{err}</p>}{msg&&<p className="success" role="status">{msg}</p>}</Glass></AppShell>;
}
