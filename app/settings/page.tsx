"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell, Glass } from "@/components/ui";
import ThemeToggle from "@/components/ThemeToggle";
import { useUser } from "@/lib/useUser";
export default function Page(){
  const { user, sb } = useUser();
  const [name,setName]=useState(""); const [msg,setMsg]=useState(""); const [err,setErr]=useState("");
  const [includeMessages,setIncludeMessages]=useState(false);
  useEffect(()=>{ if(user&&sb) sb.from("profiles").select("display_name").eq("id",user.id).single().then(({data})=>setName(data?.display_name||"")); },[user,sb]);
  async function saveProfile(e:React.FormEvent){ e.preventDefault(); if(!sb||!user) return; const {error}=await sb.from("profiles").update({display_name:name}).eq("id",user.id); if(error) setErr(error.message); else setMsg("Profile updated."); }
  // Default export is METADATA ONLY for conversations (titles + dates, no
  // message bodies), plus the user's own tasks, memories, mood check-ins,
  // study sessions and profile. Tick the checkbox to also include full
  // message bodies — that is off by default and stated clearly here.
  async function exportData(){ if(!sb||!user) return;
    const out:Record<string,unknown>={ exported_at:new Date().toISOString(), user_id:user.id, conversations_include_message_bodies:includeMessages };
    const own = async (t:string, cols:string) => { const {data}=await sb.from(t).select(cols).eq("user_id",user.id); return data||[]; };
    out.profiles = (await sb.from("profiles").select("*").eq("id",user.id)).data||[];
    out.conversations = await own("conversations","id,title,created_at,updated_at");
    if(includeMessages) out.messages = await own("messages","id,conversation_id,role,content,created_at");
    out.tasks = await own("tasks","*");
    out.memories = await own("memories","*");
    out.mood_checkins = await own("mood_checkins","*");
    out.study_sessions = await own("study_sessions","*");
    const blob=new Blob([JSON.stringify(out,null,2)],{type:"application/json"}); const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download="edith-data-export.json"; a.click(); URL.revokeObjectURL(a.href); setMsg(includeMessages ? "Export downloaded — includes full message bodies, as you opted in." : "Export downloaded — conversation metadata only (no message bodies)."); }
  async function logout(){ if(!sb) return; await sb.auth.signOut(); window.location.href="/"; }
  async function deleteAccount(){ if(!confirm("Permanently delete your account and all EDITH data? This cannot be undone.")) return; if(!confirm("Are you absolutely sure?")) return;
    const res=await fetch("/api/account/delete",{method:"POST"}); const d=await res.json(); if(!res.ok){ setErr(d.error||"Deletion failed — nothing was deleted."); return; } window.location.href="/"; }
  return <AppShell title="Settings & privacy">
    <Glass><h3 style={{marginTop:0}}>Profile</h3>
      <p className="muted">Signed in as {user?.email||"(not signed in)"}</p>
      <form onSubmit={saveProfile}><label htmlFor="n">Display name</label><input id="n" className="input" value={name} onChange={e=>setName(e.target.value)} /><p><button className="btn">Save</button></p></form>
      <p><Link href="/onboarding">Edit onboarding, goals & response style →</Link></p>
      <p><ThemeToggle /> <span className="muted" style={{ fontSize: ".85rem" }}>Saved to your account when signed in; otherwise kept in this browser only. Dark is the default.</span></p>
      <p><Link href="/memories">Memory controls (enable/disable, clear all) →</Link></p>
    </Glass><div style={{height:12}} />
    <Glass><h3 style={{marginTop:0}}>Install EDITH as an app</h3>
      <p className="muted">EDITH installs as a web app (PWA) on your phone&apos;s home screen — full-screen, with its own icon. It is not a native store app, and there is no App Store or Play Store listing.</p>
      <p><Link href="/install">How to install EDITH on Android &amp; iPhone →</Link></p>
    </Glass><div style={{height:12}} />
    <Glass><h3 style={{marginTop:0}}>Notifications & report delivery</h3>
      <p className="muted">Email delivery works only when a provider is configured (EMAIL_PROVIDER=resend + RESEND_API_KEY); otherwise the Insights &quot;Email this report&quot; button returns a clear &quot;not configured&quot; error and nothing is sent. Only the weekly-report summary is ever emailed, to your own signed-in address — never conversations, memories or reflections, and never to parents or third parties by default (there is no parent-report feature). Weekly reports can always be generated and downloaded as a server PDF from Insights.</p>
    </Glass><div style={{height:12}} />
    <Glass><h3 style={{marginTop:0}}>Your data</h3>
      <p className="muted">Privacy: your rows in Supabase are protected by Row Level Security (only your authenticated user can access them). The Gemini key and service-role key are server-only.</p>
      <p><Link href="/integrations">Integration status panel (what is configured, honestly) →</Link></p>
      <p className="muted">Data export: by default it downloads <strong>conversation metadata only</strong> (titles and dates — no message bodies), plus your tasks, memories, mood check-ins, study sessions and profile.</p>
      <label style={{display:"flex",gap:".5rem",alignItems:"center"}}><input type="checkbox" checked={includeMessages} onChange={e=>setIncludeMessages(e.target.checked)} /> Also include full message bodies in the export (off by default)</label>
      <p style={{display:"flex",gap:".5rem",flexWrap:"wrap"}}><button className="btn btn-secondary" onClick={exportData}>Download my data (JSON)</button><button className="btn btn-secondary" onClick={logout}>Log out</button></p>
      <h4>Danger zone</h4>
      <p className="muted">Account deletion removes your auth user and, via database cascades, your profile and user-owned records. It requires the server service-role key to be configured; if it is not, deletion fails safely and nothing is removed.</p>
      <button className="btn btn-danger" onClick={deleteAccount}>Delete my account</button>
      {err&&<p className="error" role="alert">{err}</p>}{msg&&<p className="success" role="status">{msg}</p>}
    </Glass></AppShell>;
}
