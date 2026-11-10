"use client";
import { useEffect, useRef, useState } from "react";
import { AppShell, Glass } from "@/components/ui";
import { useUser } from "@/lib/useUser";
export default function Page(){
  const { user, sb } = useUser();
  const [question,setQuestion]=useState(""); const [vision,setVision]=useState(""); const [prompt,setPrompt]=useState(""); const [img,setImg]=useState(""); const [err,setErr]=useState(""); const [busy,setBusy]=useState(false);
  const [preview,setPreview]=useState("");
  const [imgSource,setImgSource]=useState("");
  const [camOn,setCamOn]=useState(false); const [camErr,setCamErr]=useState(""); const [camBusy,setCamBusy]=useState(false);
  const videoRef=useRef<HTMLVideoElement|null>(null); const streamRef=useRef<MediaStream|null>(null);
  function stopCamera(){ streamRef.current?.getTracks().forEach(t=>t.stop()); streamRef.current=null; if(videoRef.current) videoRef.current.srcObject=null; setCamOn(false); }
  useEffect(()=>()=>{ streamRef.current?.getTracks().forEach(t=>t.stop()); },[]);
  async function askVision(imageBase64:string,mimeType:string){ setErr(""); setVision(""); setPreview(`data:${mimeType};base64,${imageBase64}`); setBusy(true); try{ const res=await fetch("/api/vision",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({imageBase64,mimeType,question})}); const d=await res.json(); if(!res.ok) throw new Error(d.error); setVision(d.reply); }catch(e){ setErr((e as Error).message); } finally{ setBusy(false); } }
  async function onFile(f:File){ if(f.size>5_000_000){ setErr("Image must be under 5MB."); return; }
    const buf=await f.arrayBuffer();
    // Read as base64 safely in chunks
    let binary=""; const bytes=new Uint8Array(buf); for(let i=0;i<bytes.length;i+=0x8000){ binary+=String.fromCharCode(...bytes.subarray(i,i+0x8000)); }
    await askVision(btoa(binary), f.type); }
  async function startCamera(){ setCamErr(""); setCamBusy(true);
    if(!navigator.mediaDevices?.getUserMedia){ setCamErr("Live camera is not available in this browser. Use the upload or Take a photo option instead."); setCamBusy(false); return; }
    try{
      let stream: MediaStream;
      try{ stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:"environment"}}); }
      catch{ stream=await navigator.mediaDevices.getUserMedia({video:true}); }
      streamRef.current=stream; setCamOn(true);
      // Attach on the next tick so the <video> element exists.
      setTimeout(()=>{ if(videoRef.current) videoRef.current.srcObject=stream; },0);
    }catch(e){ setCamErr("Camera permission was denied or the camera could not be started. Use the upload or Take a photo option instead."); }
    finally{ setCamBusy(false); } }
  async function capturePhoto(){ const v=videoRef.current; if(!v||!v.videoWidth) return; const c=document.createElement("canvas"); c.width=v.videoWidth; c.height=v.videoHeight; c.getContext("2d")?.drawImage(v,0,0); const dataUrl=c.toDataURL("image/jpeg",0.85); const base64=dataUrl.split(",")[1]||""; stopCamera(); await askVision(base64,"image/jpeg"); }
  async function generate(e:React.FormEvent){ e.preventDefault(); setErr(""); setImg(""); setImgSource(""); setBusy(true);
    try{ const res=await fetch("/api/image",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({prompt})}); const d=await res.json(); if(!res.ok) throw new Error(d.error);
      const url=`data:${d.mimeType};base64,${d.imageData}`; setImg(url); setImgSource(typeof d.source==="string"?d.source:"");
      if(sb&&user) await sb.from("generated_images").insert({user_id:user.id,prompt,storage_path:null,metadata:{mimeType:d.mimeType,source:d.source,note:"Image returned inline; binary is not stored by default."}});
    }catch(e){ setErr((e as Error).message); } finally{ setBusy(false); } }
  return <AppShell title="Image: vision & generation">
    <Glass><h3 style={{marginTop:0}}>Ask about an image (vision)</h3>
      <label htmlFor="q">Question</label><input id="q" className="input" value={question} onChange={e=>setQuestion(e.target.value)} placeholder="What does this diagram show?" />
      <label htmlFor="f">Upload image (PNG/JPEG/WebP/GIF, max 5MB — sent to the AI provider, not stored)</label>
      <input id="f" type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={e=>{ const f=e.target.files?.[0]; if(f) onFile(f); }} />
      <label htmlFor="fc">Or take a photo (opens your device camera)</label>
      <input id="fc" type="file" accept="image/*" capture="environment" onChange={e=>{ const f=e.target.files?.[0]; if(f) onFile(f); e.target.value=""; }} />
      <p><button className="btn btn-secondary" onClick={startCamera} disabled={camOn||camBusy}>{camBusy?"Starting camera…":"Use live camera"}</button></p>
      {camErr&&<p className="error" role="alert">{camErr}</p>}
      {camOn&&<div>
        <video ref={videoRef} autoPlay playsInline muted style={{maxWidth:"100%",borderRadius:16}} />
        <p style={{display:"flex",gap:".5rem",flexWrap:"wrap"}}><button className="btn" onClick={capturePhoto}>📷 Capture photo</button><button className="btn btn-secondary" onClick={stopCamera}>Stop camera</button></p>
      </div>}
      <p className="muted" style={{fontSize:".85rem"}}>The live camera needs HTTPS and your permission. The preview stays on your device; the photo is sent to the AI provider only for the question you ask — exactly like an upload — and is not stored by EDITH. If the camera is denied, use the upload or Take a photo option instead.</p>
      {preview&&<img src={preview} alt="Photo asked about" style={{maxWidth:"100%",borderRadius:16}} />}
      {busy&&<p className="muted">Working…</p>} {vision&&<p style={{whiteSpace:"pre-wrap"}}>{vision}</p>}
    </Glass><div style={{height:12}} />
    <Glass><h3 style={{marginTop:0}}>Generate an image</h3>
      <form onSubmit={generate}><label htmlFor="p">Prompt</label><input id="p" className="input" value={prompt} onChange={e=>setPrompt(e.target.value)} required maxLength={1000} /><p><button className="btn" disabled={busy}>Generate</button></p></form>
      <p className="muted" style={{fontSize:".85rem"}}>Generation uses the separate image model (GEMINI_IMAGE_MODEL, default gemini-2.5-flash-image) and requests image output explicitly. A 422 now means the provider genuinely returned no image for that prompt — no placeholder is faked.</p>
      {img&&<><img src={img} alt={`Generated: ${prompt}`} style={{maxWidth:"100%",borderRadius:16}} />
      {imgSource==="pollinations"&&<p className="muted" style={{fontSize:".85rem"}}>Made with the free Pollinations fallback — Gemini image quota on this key is 0. Enable billing in Google AI Studio to use Gemini images.</p>}
      {imgSource==="gemini"&&<p className="muted" style={{fontSize:".85rem"}}>Generated with Gemini.</p>}</>}
    </Glass>
    {err&&<p className="error" role="alert">{err}</p>}
  </AppShell>;
}
