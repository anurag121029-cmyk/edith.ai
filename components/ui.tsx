import Link from "next/link";
import { isSupabaseConfigured } from "@/lib/config";
import { SidebarNav, MobileNav } from "@/components/NavLinks";

export function Glass({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`glass p-5 ${className}`}>{children}</div>;
}

export function NotConfigured() {
  if (isSupabaseConfigured) return null;
  return (
    <div className="notice" role="alert" style={{ marginBottom: "1rem" }}>
      <strong>Supabase is not configured.</strong>
      <p className="muted" style={{ margin: ".3rem 0 0" }}>
        Add <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to <code>.env.local</code> (see README), run the SQL in <code>supabase/apply-all.sql</code>, then restart. Until then, login, signup and saved data are unavailable — nothing here is faked.
      </p>
    </div>
  );
}

export function EmptyState({ text }: { text: string }) {
  return <div className="empty-state" role="status">{text}</div>;
}

export function AppShell({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <div className="app-shell">
      <aside className="sidebar no-print">
        <Link href="/" className="sidebar-brand">✦ EDITH AI</Link>
        <SidebarNav />
      </aside>
      <main className="app-main">
        <header className="page-header">
          <h1>{title}</h1>
        </header>
        <NotConfigured />
        {children}
        <MobileNav />
        <div className="mobile-spacer" />
      </main>
    </div>
  );
}
