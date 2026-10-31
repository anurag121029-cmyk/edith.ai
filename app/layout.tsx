import type { Metadata, Viewport } from "next";
import "./globals.css";
import ServiceWorker from "@/components/ServiceWorker";
import SiteFooter from "@/components/SiteFooter";
export const metadata: Metadata = {
  title: "EDITH AI — Your intelligent assistant for calmer, clearer work",
  description: "EDITH AI helps with studying, tasks, workload analysis and non-clinical stress check-ins — and remembers only the context you choose to save.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg" },
  openGraph: {
    title: "EDITH AI",
    description: "Your intelligent assistant for calmer, clearer work: studying, tasks, workload and non-clinical stress check-ins.",
    type: "website",
    siteName: "EDITH AI",
  },
  twitter: { card: "summary", title: "EDITH AI", description: "Your intelligent assistant for calmer, clearer work." },
};
export const viewport: Viewport = { themeColor: "#12122a" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}<SiteFooter /><ServiceWorker /></body></html>;
}
