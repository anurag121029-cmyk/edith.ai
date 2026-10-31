import Link from "next/link";
import { Glass } from "@/components/ui";
export default function Page() {
  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "2rem 1.2rem" }}>
      <p><Link href="/">← Back home</Link></p>
      <h1>Terms</h1>
      <p className="muted">Simple, honest terms for using EDITH AI. If anything here conflicts with the Privacy page on data handling, the Privacy page describes the actual behaviour.</p>
      <Glass>
        <h3 style={{ marginTop: 0 }}>The service</h3>
        <p>EDITH AI is a personal assistant for studying, tasks, workload analysis and non-clinical stress check-ins. It is provided as-is, without any guarantee of availability, accuracy or fitness for a particular purpose.</p>
        <h3>Your account</h3>
        <p>You are responsible for keeping your account credentials safe and for the content you save. Do not store passwords, keys, secrets or other people&apos;s private information in EDITH, and do not use it to break the law or to harm others.</p>
        <h3>AI content — not advice</h3>
        <p>AI answers may be incomplete or wrong. Check important study, work or health-related information yourself. EDITH is not a medical, psychological or professional service: it does not diagnose, treat or predict any condition, and it is not a substitute for professional help. If you are struggling, please talk to a trusted person or a qualified professional.</p>
        <h3>Your data</h3>
        <p>You own the data you save. You can export it as JSON and delete your account from Settings (see Privacy for how deletion works). EDITH may change or discontinue features; your exported data remains yours.</p>
        <h3>Fair use</h3>
        <p>AI routes are rate-limited per IP (chat 30/min; vision and image 10/min each). Excessive or automated abuse may be limited further.</p>
        <h3>Changes</h3>
        <p>These terms may be updated as EDITH changes. Continued use after an update means you accept the updated terms.</p>
      </Glass>
    </main>
  );
}
