"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell, Glass } from "@/components/ui";

type Health = { checks?: { supabaseConfigured?: boolean; geminiConfigured?: boolean; geminiModel?: string; emailConfigured?: boolean; serviceRoleConfigured?: boolean } };

function State({ ok, label }: { ok: boolean | null; label: string }) {
  // ok === null means "capability check, not a server config check".
  return <strong>{ok === null ? label : ok ? "● Configured" : "○ Not configured"}</strong>;
}

/**
 * Integration status (spec §22). Honest states only:
 * - Server rows come from GET /api/health, which reports configuration
 *   PRESENCE only — never secret values, and presence is NOT proof of a
 *   working live connection ("configured, not live-verified").
 * - Speech rows are browser capability checks, labelled as such.
 * - Email is "not configured" unless EMAIL_PROVIDER is set; no delivery
 *   is ever claimed, and no delivery status is fabricated.
 * This page is authenticated (see middleware) and is NOT in public nav.
 */
export default function Page() {
  const [health, setHealth] = useState<Health | null>(null);
  const [err, setErr] = useState("");
  const [speech, setSpeech] = useState<{ stt: boolean; tts: boolean } | null>(null);
  useEffect(() => {
    fetch("/api/health").then((r) => r.json()).then(setHealth).catch((e) => setErr((e as Error).message));
    const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown; speechSynthesis?: unknown };
    setSpeech({ stt: Boolean(w.SpeechRecognition || w.webkitSpeechRecognition), tts: Boolean(w.speechSynthesis) });
  }, []);
  const c = health?.checks || {};
  const rows: { name: string; state: React.ReactNode; note: string }[] = [
    { name: "Supabase (auth + database)", state: <State ok={c.supabaseConfigured ?? false} label="" />, note: "Config presence only. Live RLS behaviour needs a real project with two test accounts — unverified here." },
    { name: "Gemini — chat", state: <State ok={c.geminiConfigured ?? false} label="" />, note: c.geminiConfigured ? `Key present (model: ${c.geminiModel || "default"}), but no live call has been verified in this environment.` : "GEMINI_API_KEY is missing, so /api/chat returns an honest 503." },
    { name: "Gemini — vision (image understanding)", state: <State ok={c.geminiConfigured ?? false} label="" />, note: "Shares the Gemini key; the model must be vision-capable. Unverified live." },
    { name: "Gemini — image generation", state: <State ok={c.geminiConfigured ?? false} label="" />, note: "Shares the Gemini key; the model must return image data or /api/image returns an honest 422. Unverified live." },
    { name: "Speech recognition (browser Web Speech)", state: <State ok={null} label={speech ? (speech.stt ? "● Supported in this browser" : "○ Not supported in this browser") : "Checking…"} />, note: "Browser capability only — best in Chrome/Edge; Safari support is limited. No audio is recorded in the background." },
    { name: "Text-to-speech (browser Web Speech)", state: <State ok={null} label={speech ? (speech.tts ? "● Supported in this browser" : "○ Not supported in this browser") : "Checking…"} />, note: "Browser capability only. Spoken replies stop when you stop playback." },
    { name: "File storage", state: <State ok={null} label="○ Not used by EDITH" />, note: "Uploads are sent to the vision API and are not stored; there is no Supabase Storage bucket in this app." },
    { name: "PDF generation", state: <State ok={null} label="● Available via browser print" />, note: "Weekly reports use the browser print dialog → “Save as PDF”. There is no server-generated PDF file." },
    { name: "Email delivery (weekly reports)", state: <State ok={c.emailConfigured ?? false} label="" />, note: c.emailConfigured ? "EMAIL_PROVIDER is set, but delivery has not been verified end-to-end — do not treat this as proof a report was sent." : "No provider configured, so no email is sent. Print/download from Insights is the available option." },
    { name: "Account deletion (server service-role key)", state: <State ok={c.serviceRoleConfigured ?? false} label="" />, note: "Server-only key. If missing, deletion fails safely and nothing is removed." },
  ];
  return (
    <AppShell title="Integration status">
      <Glass>
        <p className="muted">
          This panel shows <strong>configuration presence and browser capability</strong>, not live proof.
          A key being present does not prove the service works — live verification needs real credentials and a test call.
          No secret values are shown here or by <code>/api/health</code>.
        </p>
        {err && <p className="error" role="alert">{err}</p>}
        <ul style={{ listStyle: "none", padding: 0 }}>
          {rows.map((r) => (
            <li key={r.name} className="glass" style={{ padding: ".8rem", marginBottom: ".6rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
                <strong>{r.name}</strong><span>{r.state}</span>
              </div>
              <p className="muted" style={{ margin: ".3rem 0 0", fontSize: ".85rem" }}>{r.note}</p>
            </li>
          ))}
        </ul>
        <p><Link href="/settings">← Back to Settings</Link></p>
      </Glass>
    </AppShell>
  );
}
