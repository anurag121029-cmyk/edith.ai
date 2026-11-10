import Link from "next/link";
import { Glass } from "@/components/ui";
export default function Page() {
  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "2rem 1.2rem" }}>
      <p><Link href="/">← Back home</Link></p>
      <h1>Privacy</h1>
      <p className="muted">Last updated: October 2026. This statement describes what EDITH AI actually does — if a feature is not listed here, EDITH does not do it.</p>
      <Glass>
        <h3 style={{ marginTop: 0 }}>Accounts and authentication</h3>
        <p>Accounts use Supabase Auth (email and password). A profile is created automatically from your Auth account; you never supply your own user ID. Session cookies are used to keep you signed in.</p>
        <h3>Your data and who can see it</h3>
        <p>Tasks, chats, study sessions, workload entries, mood check-ins, memories, insights and reports are stored in Supabase and protected by Row Level Security: each user can only read, create, update or delete their own rows. No other user can see them through the app.</p>
        <h3>AI processing</h3>
        <p>Messages and questions you send to the assistant are sent server-side to Gemini. The Gemini API key is server-only and is never placed in browser code. AI answers are generated responses and are not guaranteed to be correct.</p>
        <h3>Voice, images and camera</h3>
        <p>Voice uses your browser&apos;s Web Speech API. Only a transcript you choose to send is stored (as a voice-session note); EDITH does not record in the background. Images uploaded for vision questions are sent to the AI provider for that question and are not stored by EDITH. The Image page also has a camera option: &quot;Take a photo&quot; opens your device camera, and &quot;Use live camera&quot; shows a live preview on your device — the camera only starts when you tap one of those, the preview never leaves your device, and a photo is sent to the AI provider only for the question you ask about it, exactly like an upload, and is not stored by EDITH. EDITH has no camera emotion or facial recognition — those belong to a separate project, not EDITH.</p>
        <h3>Reports and email</h3>
        <p>Weekly reports are generated from your own data and can be printed or saved as PDF in your browser. Email report delivery is not implemented and no email provider is configured, so EDITH does not email your reports to you or to anyone else, and there is no parent or third-party report sharing.</p>
        <h3>Memories</h3>
        <p>Only memories you explicitly save are stored. You can inspect, edit or delete individual memories, disable memory, or clear all saved memory from the Memories page. Do not store passwords, keys or secrets there; the app blocks common secret patterns.</p>
        <h3>Export and deletion</h3>
        <p>From Settings you can download a JSON export of your data. Account deletion removes your Auth account and, via database cascades, your user-owned records; it requires a server key to be configured.</p>
        <h3>What we do not do</h3>
        <p>EDITH does not sell your data, does not diagnose any medical or psychological condition, and does not make guaranteed predictions about your health or performance. Mood and stress figures are your own self-reported scores, presented as wellness summaries. The automatic mood reading is an estimate read from the words in your recent chats (with a confidence label) — it is not a diagnosis, and a manual check-in always overrides it in the stress score.</p>
      </Glass>
    </main>
  );
}
