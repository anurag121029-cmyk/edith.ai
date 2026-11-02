"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AppShell, Glass, EmptyState } from "@/components/ui";
import { useUser } from "@/lib/useUser";
import { searchMemories, formatMemoryContext } from "@/lib/logic";
import { renderMarkdownToHtml } from "@/lib/markdown";
type Msg={role:string;content:string};
type Conv={id:string;title:string};
type Mem={title:string;content:string;category?:string|null;created_at?:string};
const BLOCKED=/password|api[_ ]?key|secret|token|credit card/i;

export default function Page(){
  const { user, sb } = useUser();
  const [convs,setConvs]=useState<Conv[]>([]); const [convId,setConvId]=useState<string|null>(null);
  const [msgs,setMsgs]=useState<Msg[]>([]); const [input,setInput]=useState(""); const [busy,setBusy]=useState(false); const [err,setErr]=useState("");
  const [convSearch,setConvSearch]=useState("");
  const [memories,setMemories]=useState<Mem[]>([]); const [memoryEnabled,setMemoryEnabled]=useState(true);
  const [memoriesUsed,setMemoriesUsed]=useState(0);
  const [copiedIdx,setCopiedIdx]=useState<number|null>(null);
  const [savedIdx,setSavedIdx]=useState<number|null>(null);
  const [streaming,setStreaming]=useState(false);
  const streamRef=useRef<AbortController|null>(null);
  const endRef=useRef<HTMLDivElement>(null);

  async function loadConvs(){ if(!sb||!user) return; const {data}=await sb.from("conversations").select("id,title").order("created_at",{ascending:false}); setConvs((data||[]) as Conv[]); }
  async function loadMemories(){
    if(!sb||!user) return;
    const [m,p]=await Promise.all([
      sb.from("memories").select("title,content,category,created_at").order("created_at",{ascending:false}),
      sb.from("profiles").select("preferences").eq("id",user.id).single(),
    ]);
    setMemories((m.data||[]) as Mem[]);
    const prefs=(p.data?.preferences||{}) as {memory_enabled?:boolean};
    setMemoryEnabled(prefs.memory_enabled!==false);
  }
  useEffect(()=>{ loadConvs(); loadMemories(); /* eslint-disable-next-line */ },[user]);
  useEffect(()=>{ endRef.current?.scrollIntoView({behavior:"smooth"}); },[msgs]);

  async function openConv(id:string){ setConvId(id); setMemoriesUsed(0); if(!sb) return; const {data}=await sb.from("messages").select("role,content").eq("conversation_id",id).order("created_at",{ascending:true}); setMsgs((data||[]) as Msg[]); }
  function newConv(){ setConvId(null); setMsgs([]); setMemoriesUsed(0); }

  async function renameConv(c:Conv){
    if(!sb) return;
    const title=prompt("Rename conversation", c.title);
    if(!title||!title.trim()||title.trim()===c.title) return;
    const {error}=await sb.from("conversations").update({title:title.trim().slice(0,120)}).eq("id",c.id);
    if(error) setErr(error.message); else loadConvs();
  }
  async function deleteConv(c:Conv){
    if(!sb) return;
    if(!confirm(`Delete conversation “${c.title}”? Its messages will be deleted too. This cannot be undone.`)) return;
    const {error}=await sb.from("conversations").delete().eq("id",c.id);
    if(error){ setErr(error.message); return; }
    if(convId===c.id){ setConvId(null); setMsgs([]); }
    loadConvs();
  }

  /** Persist one user + one assistant message exactly as before (the
   * streamed reply is saved as a single message, never as fragments). */
  async function persistTurn(userText:string, reply:string, currentConvId:string|null){
    if(!sb||!user) return;
    let cid=currentConvId;
    if(!cid){ const {data:c,error}=await sb.from("conversations").insert({user_id:user.id,title:userText.slice(0,60)}).select("id").single(); if(!error&&c){ cid=c.id as string; setConvId(cid); } }
    if(cid){ await sb.from("messages").insert([{conversation_id:cid,user_id:user.id,role:"user",content:userText},{conversation_id:cid,user_id:user.id,role:"assistant",content:reply}]); loadConvs(); }
  }

  /** Non-streaming fallback: the original /api/chat path, unchanged. */
  async function sendNonStreaming(userText:string, priorMsgs:Msg[], used:Mem[]):Promise<string>{
    const res=await fetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:userText,history:priorMsgs,memories:used.map(m=>({title:m.title,content:m.content}))})});
    const data=await res.json(); if(!res.ok) throw new Error(data.error||"AI request failed");
    return data.reply as string;
  }

  /** Core send: streams /api/chat/stream, falling back to /api/chat on
   * any streaming error before text arrives. Stop keeps the partial
   * reply (if any) and still saves it as one message. */
  async function sendMessage(userText:string, priorMsgs:Msg[], currentConvId:string|null){
    setErr(""); setBusy(true);
    const userMsg={role:"user",content:userText};
    const history=[...priorMsgs,userMsg]; setMsgs(history);
    try{
      const { used } = memoryEnabled ? formatMemoryContext(memories, userText) : { used: [] as Mem[] };
      setMemoriesUsed(used.length);
      const ctrl=new AbortController(); streamRef.current=ctrl; setStreaming(true);
      let reply="";
      try{
        const res=await fetch("/api/chat/stream",{method:"POST",headers:{"Content-Type":"application/json"},signal:ctrl.signal,body:JSON.stringify({message:userText,history:priorMsgs,memories:used.map(m=>({title:m.title,content:m.content}))})});
        if(!res.ok||!res.body) throw new Error("Streaming unavailable");
        const reader=res.body.getReader(); const decoder=new TextDecoder();
        for(;;){
          const {done,value}=await reader.read();
          if(done) break;
          if(value){ reply+=decoder.decode(value,{stream:true}); setMsgs([...history,{role:"assistant",content:reply}]); }
        }
        reply+=decoder.decode();
        if(!reply.trim()) throw new Error("Streaming returned no text");
      }catch(streamErr){
        if(ctrl.signal.aborted){
          // Stopped by the user: keep whatever arrived (if anything).
          if(!reply.trim()){ setMsgs(history); return; }
        } else if(!reply.trim()){
          // No streamed text at all: automatic fallback, never a dead end.
          setStreaming(false);
          reply=await sendNonStreaming(userText, priorMsgs, used);
          setMsgs([...history,{role:"assistant",content:reply}]);
        } else {
          // Partial stream then an error: keep the partial reply and say so.
          setErr("The reply was cut short by a streaming error; what arrived is shown and saved.");
        }
      } finally { setStreaming(false); streamRef.current=null; }
      if(reply.trim()){ setMsgs([...history,{role:"assistant",content:reply}]); await persistTurn(userText, reply, currentConvId); }
    }catch(e){ setErr((e as Error).message); } finally{ setBusy(false); setStreaming(false); }
  }

  function stopStreaming(){ streamRef.current?.abort(); }

  async function send(e:React.FormEvent){ e.preventDefault(); if(!input.trim()||busy) return; const text=input.trim(); setInput(""); await sendMessage(text, msgs, convId); }

  async function regenerate(){
    if(busy||!msgs.length) return;
    // Re-send the last user message as a new turn (the previous reply stays
    // in the saved history, so the UI and the database never diverge).
    const lastUser = [...msgs].reverse().find(m=>m.role==="user");
    if(!lastUser) return;
    await sendMessage(lastUser.content, msgs, convId);
  }

  async function copyMsg(i:number, content:string){
    try{ await navigator.clipboard.writeText(content); }catch{ /* clipboard unavailable — fall back silently */ const ta=document.createElement("textarea"); ta.value=content; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove(); }
    setCopiedIdx(i); setTimeout(()=>setCopiedIdx(null), 2000);
  }

  async function saveAsMemory(i:number, content:string){
    if(!sb||!user) return;
    if(BLOCKED.test(content)){ setErr("That reply looks like it contains a secret or credential, so it was not saved as a memory."); return; }
    const title=content.split("\n")[0].replace(/^#+\s*/,"").trim().slice(0,60)||"Saved from chat";
    const {error}=await sb.from("memories").insert({user_id:user.id,title,content:content.slice(0,2000),category:"chat"});
    if(error) setErr(error.message); else { setSavedIdx(i); setTimeout(()=>setSavedIdx(null), 3000); loadMemories(); }
  }

  const visibleConvs = convSearch.trim() ? convs.filter(c=>c.title.toLowerCase().includes(convSearch.trim().toLowerCase())) : convs;
  const lastUserIdx = [...msgs].reverse().findIndex(m=>m.role==="user");

  return <AppShell title="Chat with EDITH">
    <div className="chat-layout">
      <Glass className="no-print"><button className="btn" onClick={newConv}>+ New conversation</button>
        <label htmlFor="conv-search" className="muted" style={{display:"block",marginTop:"1rem",fontSize:".85rem"}}>Search conversations</label>
        <input id="conv-search" className="input" value={convSearch} onChange={e=>setConvSearch(e.target.value)} placeholder="Search by title…" />
        {visibleConvs.length? <ul style={{listStyle:"none",padding:0}}>{visibleConvs.map(c=><li key={c.id} style={{marginTop:".4rem"}}>
          <button className="btn btn-secondary" style={{width:"100%",justifyContent:"flex-start"}} onClick={()=>openConv(c.id)} aria-current={convId===c.id?"page":undefined}>{c.title}</button>
          <span style={{display:"flex",gap:".4rem",marginTop:".2rem"}}><button className="btn btn-secondary" onClick={()=>renameConv(c)}>Rename</button><button className="btn btn-danger" onClick={()=>deleteConv(c)}>Delete</button></span>
        </li>)}</ul> : <EmptyState text={convs.length ? "No conversations match that search." : (user?"No saved conversations yet.":"Sign in to save chat history.")} />}
      </Glass>
      <Glass>
        <div aria-live="polite" style={{minHeight:260,maxHeight:480,overflowY:"auto",display:"flex",flexDirection:"column",gap:".6rem"}}>
          {msgs.length===0 && <EmptyState text="Ask EDITH anything — study help, maths, coding, planning, or a summary." />}
          {msgs.map((m,i)=> m.role==="user" ? (
            <div key={i} className="chat-bubble-user" style={{alignSelf:"flex-end",maxWidth:"85%",padding:".6rem .9rem",borderRadius:16,whiteSpace:"pre-wrap"}}><strong>You:</strong> {m.content}</div>
          ) : (
            <div key={i} className="chat-bubble-edith" style={{alignSelf:"flex-start",maxWidth:"85%",padding:".6rem .9rem",borderRadius:16}}>
              <strong>EDITH:</strong>
              <div className="md" dangerouslySetInnerHTML={{__html: renderMarkdownToHtml(m.content)}} />
              <div style={{display:"flex",gap:".4rem",marginTop:".4rem",flexWrap:"wrap"}}>
                <button className="btn btn-secondary" onClick={()=>copyMsg(i,m.content)}>{copiedIdx===i?"Copied ✓":"Copy"}</button>
                <button className="btn btn-secondary" onClick={()=>saveAsMemory(i,m.content)}>{savedIdx===i?"Saved as memory ✓":"Save as memory"}</button>
              </div>
            </div>
          ))}
          {busy && !streaming && <p className="muted">EDITH is thinking…</p>}
          {streaming && <p className="muted" role="status">EDITH is writing… (streaming — you can stop at any time)</p>}<div ref={endRef} />
        </div>
        {memoriesUsed>0 && <p className="muted" role="status" style={{fontSize:".85rem"}}>Using {memoriesUsed} saved {memoriesUsed===1?"memory":"memories"} for context. <Link href="/memories">Manage memories →</Link></p>}
        {!memoryEnabled && <p className="muted" style={{fontSize:".85rem"}}>Memory is disabled, so no saved memories were used. <Link href="/memories">Enable it in Memories →</Link></p>}
        {err && <p className="error" role="alert">{err}</p>}
        <form onSubmit={send} style={{display:"flex",gap:".5rem",marginTop:"1rem"}}><input className="input" aria-label="Message EDITH" value={input} onChange={e=>setInput(e.target.value)} placeholder="Type your message…" maxLength={4000} /><button className="btn" disabled={busy}>Send</button></form>
        <p style={{display:"flex",gap:".5rem",flexWrap:"wrap",marginTop:".5rem"}}><button className="btn btn-secondary" onClick={regenerate} disabled={busy||lastUserIdx<0}>↻ Regenerate last response</button>{streaming && <button className="btn btn-danger" onClick={stopStreaming}>■ Stop generating</button>}</p>
        <p className="muted" style={{fontSize:".8rem"}}>AI answers can be wrong — check important maths, facts and code. Replies stream from /api/chat/stream and fall back to /api/chat automatically if streaming fails. Assistant replies render simple markdown (headings, lists, bold, code blocks) plus styled maths: inline $...$ and block $$...$$ — styled notation, not KaTeX typesetting.</p>
      </Glass>
    </div></AppShell>;
}
