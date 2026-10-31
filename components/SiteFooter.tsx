import Link from "next/link";
export default function SiteFooter() {
  return (
    <footer className="site-footer no-print">
      <nav aria-label="Site">
        <Link href="/features">Features</Link>
        <Link href="/privacy">Privacy</Link>
        <Link href="/terms">Terms</Link>
        <Link href="/login">Log in</Link>
        <Link href="/signup">Sign up</Link>
      </nav>
      <p className="muted">EDITH AI — wellness information, not medical diagnosis or treatment.</p>
    </footer>
  );
}
