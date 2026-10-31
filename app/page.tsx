import Link from "next/link";
import { Glass } from "@/components/ui";

const FEATURES: Array<[string, string, string]> = [
  ["AI assistant", "Chat that persists, with study, maths and coding help.", "/chat"],
  ["Workload & mood", "Track deadlines, workload and self-reported stress over time.", "/workload"],
  ["Remember My Context", "You control what's remembered — inspect, edit, disable or clear it any time.", "/memories"],
  ["Weekly insights", "Reports generated from your real data, printable as PDF.", "/insights"],
];

export default function Home() {
  return (
    <main style={{ maxWidth: 1000, margin: "0 auto", padding: "2rem 1.2rem" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
        <span style={{ fontWeight: 800, fontSize: "1.4rem" }}>✦ EDITH AI</span>
        <span style={{ display: "flex", gap: ".5rem", flexWrap: "wrap" }}>
          <Link className="btn btn-secondary" href="/login">Log in</Link>
          <Link className="btn" href="/signup">Get started</Link>
        </span>
      </header>

      <section className="hero">
        <p className="hero-eyebrow"><span className="badge">✦ Study · Plan · Reflect</span></p>
        <h1>Your intelligent assistant for calmer, clearer work</h1>
        <p className="muted">EDITH helps with studying, tasks, workload analysis and non-clinical stress check-ins — and remembers only the context you choose to save.</p>
        <p className="hero-cta">
          <Link className="btn" href="/signup">Create your account</Link>
          <Link className="btn btn-secondary" href="/features">See what EDITH does</Link>
        </p>
      </section>

      <section aria-labelledby="how-it-works">
        <h2 id="how-it-works">How it works</h2>
        <Glass>
          <ol className="step-list">
            <li><strong>Sign up</strong> <span className="muted">— create your account and confirm your email.</span></li>
            <li><strong>Set up your profile</strong> <span className="muted">— complete onboarding so EDITH knows how you like to work.</span></li>
            <li><strong>Chat, plan and reflect</strong> <span className="muted">— ask questions, manage tasks and workload, and check in on your own terms.</span></li>
          </ol>
        </Glass>
      </section>

      <section aria-labelledby="features" style={{ marginTop: "1rem" }}>
        <h2 id="features">What you can do with EDITH</h2>
        <div className="card-grid">
          {FEATURES.map(([t, d, href]) => (
            <Link key={t} href={href}>
              <Glass><h3 style={{ marginTop: 0 }}>{t}</h3><p className="muted">{d}</p></Glass>
            </Link>
          ))}
        </div>
      </section>

      <section style={{ marginTop: "1rem" }}>
        <h2>What EDITH is — and is not</h2>
        <div className="card-grid">
          <Glass><h3 style={{ marginTop: 0 }}>EDITH is</h3><ul className="muted"><li>An AI assistant for studying, tasks and workload</li><li>A place for optional self-reported mood check-ins</li><li>A memory you control — save, edit, disable or clear it</li><li>A dashboard built from your real records</li></ul></Glass>
          <Glass><h3 style={{ marginTop: 0 }}>EDITH is not</h3><ul className="muted"><li>A medical diagnosis, therapy or treatment service</li><li>A guarantee that AI answers are always correct</li><li>An email report service — delivery is not configured</li><li>A camera or emotion-reading app</li></ul></Glass>
        </div>
      </section>

      <footer className="muted" style={{ textAlign: "center", padding: "2.5rem 0 1rem", fontSize: ".85rem" }}>EDITH provides wellness information, not medical diagnosis or treatment.</footer>
    </main>
  );
}
