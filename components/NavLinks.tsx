"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export const NAV = [
  ["/dashboard", "Stress", "♥"],
  ["/chat", "Chat", "💬"],
  ["/study", "Study", "📚"],
  ["/tasks", "Tasks", "✓"],
  ["/workload", "Workload", "📊"],
  ["/mood", "Stress & mood", "♥"],
  ["/insights", "Insights", "📈"],
  ["/memories", "Memories", "🧠"],
  ["/image", "Image", "🖼"],
  ["/voice", "Voice", "🎤"],
  ["/settings", "Settings", "⚙"],
] as const;

export function SidebarNav() {
  const pathname = usePathname();
  return (
    <nav className="sidebar-nav" aria-label="Primary">
      {NAV.map(([href, label, icon]) => (
        <Link key={href} href={href} className={`nav-link${pathname === href ? " active" : ""}`} aria-current={pathname === href ? "page" : undefined}>
          <span className="nav-icon" aria-hidden="true">{icon}</span>
          {label}
        </Link>
      ))}
    </nav>
  );
}

export function MobileNav() {
  const pathname = usePathname();
  return (
    <nav className="mobile-nav no-print" aria-label="Mobile">
      {NAV.map(([href, label, icon]) => (
        <Link key={href} href={href} className={`mobile-nav-link${pathname === href ? " active" : ""}`} aria-current={pathname === href ? "page" : undefined}>
          <span aria-hidden="true">{icon}</span>
          {label}
        </Link>
      ))}
    </nav>
  );
}
