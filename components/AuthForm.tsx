"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured, appUrl } from "@/lib/config";
import { Glass } from "./ui";
export default function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [msg, setMsg] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr(""); setMsg("");
    const sb = createClient(); if (!sb) { setErr("Supabase is not configured, so authentication is unavailable. Add the Supabase keys in .env.local — see README."); return; }
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: `${appUrl}/auth/callback?next=/onboarding` } });
        if (error) throw error;
        setMsg("Account created. Check your email to confirm, then log in. A profile is created automatically by the database trigger.");
      } else {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
        const next = new URLSearchParams(window.location.search).get("next");
        window.location.href = next && next.startsWith("/") ? next : "/dashboard";
      }
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <main style={{maxWidth:440,margin:"3rem auto",padding:"0 1rem"}}>
      <Glass><h1 style={{marginTop:0}}>{mode === "signup" ? "Create your EDITH account" : "Welcome back"}</h1>
      {!isSupabaseConfigured && <p className="error" role="alert">Supabase is not configured — authentication is unavailable until the keys are added (see README).</p>}
      <form onSubmit={submit}>
        <label htmlFor="email">Email</label><input id="email" className="input" type="email" required value={email} onChange={(e)=>setEmail(e.target.value)} autoComplete="email" />
        <label htmlFor="password">Password</label><input id="password" className="input" type="password" required minLength={6} value={password} onChange={(e)=>setPassword(e.target.value)} autoComplete={mode==="signup"?"new-password":"current-password"} />
        <p><button className="btn" disabled={busy} type="submit">{busy ? "Please wait…" : mode === "signup" ? "Sign up" : "Log in"}</button></p>
      </form>
      {err && <p className="error" role="alert">{err}</p>} {msg && <p className="success" role="status">{msg}</p>}
      <p className="muted">{mode === "signup" ? <>Already have an account? <a href="/login">Log in</a></> : <>New to EDITH? <a href="/signup">Sign up</a> · <a href="/reset-password">Forgot password?</a></>}</p>
      </Glass>
    </main>
  );
}
