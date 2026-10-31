import Link from "next/link";
import { Glass } from "@/components/ui";
export default function NotFound() {
  return (
    <main style={{ maxWidth: 700, margin: "0 auto", padding: "3rem 1.2rem", textAlign: "center" }}>
      <Glass>
        <h1 style={{ marginTop: 0 }}>Page not found (404)</h1>
        <p className="muted">That page does not exist or has moved. Your saved data is unaffected.</p>
        <p><Link className="btn" href="/">Go home</Link> <Link className="btn btn-secondary" href="/dashboard">Go to dashboard</Link></p>
      </Glass>
    </main>
  );
}
