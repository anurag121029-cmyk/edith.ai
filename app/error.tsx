"use client";
import Link from "next/link";
import { Glass } from "@/components/ui";
export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main style={{ maxWidth: 700, margin: "0 auto", padding: "3rem 1.2rem", textAlign: "center" }}>
      <Glass>
        <h1 style={{ marginTop: 0 }}>Something went wrong</h1>
        <p className="muted">EDITH hit an unexpected error on this page. Your saved data is not affected by showing this message.</p>
        <p><button className="btn" onClick={() => reset()}>Try again</button> <Link className="btn btn-secondary" href="/">Go home</Link></p>
      </Glass>
    </main>
  );
}
