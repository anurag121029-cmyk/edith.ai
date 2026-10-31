"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { appUrl } from "@/lib/config";
import { Glass } from "@/components/ui";
export default function Page(){
  const [email,setEmail]=useState(""); const [msg,setMsg]=useState(""); const [err,setErr]=useState("");
  const [newPw,setNewPw]=useState("");
  async function send(e:React.FormEvent){ e.preventDefault(); const sb=createClient(); if(!sb){setErr("Supabase is not configured.");return;}
    const {error}=await sb.auth.resetPasswordForEmail(email,{redirectTo:`${appUrl}/reset-password`}); if(error) setErr(error.message); else setMsg("Password reset email sent if that account exists."); }
  async function update(e:React.FormEvent){ e.preventDefault(); const sb=createClient(); if(!sb) return; const {error}=await sb.auth.updateUser({password:newPw}); if(error) setErr(error.message); else setMsg("Password updated. You can now log in."); }
  return <main style={{maxWidth:440,margin:"3rem auto",padding:"0 1rem"}}><Glass><h1 style={{marginTop:0}}>Reset password</h1>
    <form onSubmit={send}><label htmlFor="email">Email</label><input id="email" className="input" type="email" value={email} onChange={e=>setEmail(e.target.value)} required /><p><button className="btn">Send reset email</button></p></form>
    <form onSubmit={update}><label htmlFor="np">New password (after opening the reset link)</label><input id="np" className="input" type="password" minLength={6} value={newPw} onChange={e=>setNewPw(e.target.value)} /><p><button className="btn btn-secondary">Update password</button></p></form>
    {err&&<p className="error" role="alert">{err}</p>}{msg&&<p className="success" role="status">{msg}</p>}</Glass></main>;
}
