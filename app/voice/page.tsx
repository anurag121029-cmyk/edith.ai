"use client";
import { useRef, useState } from "react";
import { AppShell, Glass } from "@/components/ui";
import { useUser } from "@/lib/useUser";
type SR = { lang:string; interimResults:boolean; onresult:((e:{results:{0:{0:{transcript:string}}}})=>void)|null; onerror:(()=>void)|null; onend:(()=>void)|null; start:()=>void; stop:()=>void };
export default function Page(){
  const { user, sb } = useUser();
  const [text,setText]=useState(""); const [reply,setReply]=useState(""); const [status,setStatus]=useState(""); const [err,setErr]=useState("");
  const recRef=useRef<SR|null>(null);
  const supported = typeof window!=="undefined" && ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);
  function listen(){ setErr(""); const W=window as unknown as {SpeechRecognition?:new()=>SR;webkitSpeechRecognition?:new()=>SR}; const Ctor=W.SpeechRecognition||W.webkitSpeechRecognition;
    if(!Ctor){ setErr("Speech recognition is not supported in this browser. Try Chrome/Edge, or type instead."); return; }
    const rec=new Ctor(); rec.lang="en-GB"; rec.interimResults=false;
    rec.onresult=(e)=>setText(e.results[0][0].transcript);
    rec.onerror=()=>setStatus("Microphone error or permission denied. Nothing was recorded.");
    rec.onend=()=>setStatus("Listening stopped.");
    recRef.current=rec; setStatus("Listening… (your browser may ask for microphone permission)"); rec.start(); }
  async function send(){ if(!text.trim()) return; setStatus("Sending to EDITH…");
    try{ const res=await fetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:text})}); const d=await res.json(); if(!res.ok) throw new Error(d.error); setReply(d.reply); setStatus("");
      if(sb&&user) await sb.from("voice_sessions").insert({user_id:user.id,transcript:text,metadata:{reply_preview:d.reply.slice(0,200)}});
    }catch(e){ setErr((e as Error).message); } }
  function speak(){ if(!("speechSynthesis" in window)){ setErr("Text-to-speech is not supported in this browser."); return; } speechSynthesis.cancel(); const u=new SpeechSynthesisUtterance(reply||text); speechSynthesis.speak(u); }
  return <AppShell title="Voice interaction"><Glass>
    <p className="muted">Voice uses your browser&apos;s Web Speech API. Audio is processed by your browser/OS speech service; EDITH does not record in the background, and only the transcript you send is stored (as a voice-session note).</p>
    {!supported && <p className="error" role="alert">Speech recognition is not supported in this browser — typing and text-to-speech may still work.</p>}
    <p style={{display:"flex",gap:".5rem",flexWrap:"wrap"}}><button className="btn" onClick={listen}>🎤 Start listening</button><button className="btn btn-secondary" onClick={()=>{recRef.current?.stop();}}>Stop listening</button></p>
    <label htmlFor="t">Recognised / typed text</label><textarea id="t" className="input" rows={3} value={text} onChange={e=>setText(e.target.value)} />
    <p style={{display:"flex",gap:".5rem",flexWrap:"wrap"}}><button className="btn" onClick={send}>Send to EDITH</button><button className="btn btn-secondary" onClick={speak}>▶ Play response</button><button className="btn btn-secondary" onClick={()=>speechSynthesis.cancel()}>Stop speech</button></p>
    {status&&<p className="muted" role="status">{status}</p>} {err&&<p className="error" role="alert">{err}</p>} {reply&&<p style={{whiteSpace:"pre-wrap"}}>{reply}</p>}
  </Glass></AppShell>;
}
