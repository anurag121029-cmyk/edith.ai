"use client";
import { useState } from "react";
import { AppShell, Glass } from "@/components/ui";
import { useUser } from "@/lib/useUser";
export default function Page(){
  const { user, sb } = useUser();
  const [question,setQuestion]=useState(""); const [vision,setVision]=useState(""); const [prompt,setPrompt]=useState(""); const [img,setImg]=useState(""); const [source,setSource]=useState(""); const [err,setErr]=useState(""); const [busy,setBusy]=useState(false);
  async function onFile(f:File){ setErr(""); if(f.size>5_000_000){ setErr("Image must be under 5MB."); return; }
    const buf=await f.arrayBuffer();
    // Read as base64 safely in chunks
    let binary=""; const bytes=new Uint8Array(buf); for(let i=0;i<bytes.length;i+=0x8000){ binary+=String.fromCharCode(...bytes.subarray(i,i+0x8000)); }
    const base64=btoa(binary);
    setBusy(true); try{ const res=await fetch("/api/vision",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({imageBase64:base64,mimeType:f.type,question})}); const d=await res.json(); if(!res.ok) throw new Error(d.error); setVision(d.reply); }catch(e){ setErr((e as Error).message); } finally{ setBusy(false); } }
  async function generate(e:React.FormEvent){ e.preventDefault(); setErr(""); setImg(""); setSource(""); setBusy(true);
    try{ const res=await fetch("/api/image",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({prompt})}); const d=await res.json(); if(!res.ok) throw new Error(d.error);
      const url=`data:${d.mimeType};base64,${d.imageData}`; setImg(url); setSource(d.source||"");
      if(sb&&user) await sb.from("generated_images").insert({user_id:user.id,prompt,storage_path:null,metadata:{mimeType:d.mimeType,source:d.source||"gemini",note:"Image returned inline; binary is not stored by default."}});
    }catch(e){ setErr((e as Error).message); } finally{ setBusy(false); } }
  return <AppShell title="Image: vision & generation">
    <Glass><h3 style={{marginTop:0}}>Ask about an image (vision)</h3>
      <label htmlFor="q">Question</label><input id="q" className="input" value={question} onChange={e=>setQuestion(e.target.value)} placeholder="What does this diagram show?" />
      <label htmlFor="f">Upload image (PNG/JPEG/WebP/GIF, max 5MB — sent to the AI provider, not stored)</label>
      <input id="f" type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={e=>{ const f=e.target.files?.[0]; if(f) onFile(f); }} />
      {busy&&<p className="muted">Working…</p>} {vision&&<p style={{whiteSpace:"pre-wrap"}}>{vision}</p>}
    </Glass><div style={{height:12}} />
    <Glass><h3 style={{marginTop:0}}>Generate an image</h3>
      <form onSubmit={generate}><label htmlFor="p">Prompt</label><input id="p" className="input" value={prompt} onChange={e=>setPrompt(e.target.value)} required maxLength={1000} /><p><button className="btn" disabled={busy}>Generate</button></p></form>
      <p className="muted" style={{fontSize:".85rem"}}>Generation tries Gemini first (GEMINI_IMAGE_MODEL, default gemini-2.5-flash-image) and requests image output explicitly. The Gemini image quota on the current key is 0, so when Gemini refuses with a quota error the free Pollinations fallback is used instead — no key needed. A 422 now means both providers failed for that prompt — no placeholder is faked.</p>
      {img&&<img src={img} alt={`Generated: ${prompt}`} style={{maxWidth:"100%",borderRadius:16}} />}
      {img&&source==="pollinations"&&<p className="muted" style={{fontSize:".85rem"}}>Made with the free Pollinations fallback — Gemini image quota on this key is 0. Enable billing in Google AI Studio to use Gemini images.</p>}
      {img&&source==="gemini"&&<p className="muted" style={{fontSize:".85rem"}}>Generated with Gemini.</p>}
    </Glass>
    {err&&<p className="error" role="alert">{err}</p>}
  </AppShell>;
}
