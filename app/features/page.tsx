import Link from "next/link";
import { Glass } from "@/components/ui";
const FEATURES: [string, string][] = [
  ["AI assistant & chat", "Persistent conversations with study, maths and coding help, powered server-side by Gemini. AI routes are rate-limited and return honest errors when unconfigured."],
  ["Study assistant", "Step-by-step explanations, practice questions and a logged study session history."],
  ["Task manager", "Full task CRUD with due dates, priorities, categories, filters and overdue tracking."],
  ["Workload analyser", "Workload entries with hours and intensity, plus trend summaries and break suggestions."],
  ["Mood & stress check-ins", "Optional self-reported mood and stress scores with trends. These are wellness summaries, not diagnoses."],
  ["Weekly insights & reports", "One report per user per week, generated from your real tasks, study, workload and mood data, printable as PDF via your browser."],
  ["Remember My Context", "Memories you explicitly save, with keyword search, editing, deletion, an enable/disable toggle and clear-all. Passwords and secrets are blocked from being saved."],
  ["Vision & image generation", "Ask questions about an uploaded image (uploads are not stored). Image generation only works when the configured model actually returns image data — otherwise you get a clear error, never a placeholder."],
  ["Voice interaction", "Browser Web Speech recognition and text-to-speech, with a transcript you choose to send. EDITH has no camera features."],
  ["Settings, export & deletion", "Profile editing, a JSON export of your data, and account deletion (when a server key is configured)."],
  ["Progressive Web App", "Installable on a phone over HTTPS, with a service worker that never caches API or private responses."],
];
export default function Page() {
  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "2rem 1.2rem" }}>
      <p><Link href="/">← Back home</Link></p>
      <h1>Features</h1>
      <p className="muted">Everything below is what EDITH AI actually does today. Nothing here is a mock-up: if a capability needs a key or provider that is not configured, the app says so instead of faking it.</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: "1rem" }}>
        {FEATURES.map(([t, d]) => <Glass key={t}><h3 style={{ marginTop: 0 }}>{t}</h3><p className="muted">{d}</p></Glass>)}
      </div>
      <p style={{ marginTop: "1.5rem" }}><Link className="btn" href="/signup">Get started</Link> <Link className="btn btn-secondary" href="/login">Log in</Link></p>
    </main>
  );
}
