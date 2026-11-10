import Link from "next/link";
import { AppShell, Glass } from "@/components/ui";
import InstallApp from "@/components/InstallApp";

// Public install guide: EDITH installs as a PWA (a web app added to the
// home screen), not as a native store app. No account is needed to read
// these steps; installing itself needs the site served over HTTPS.
export default function Page() {
  return (
    <AppShell title="Install EDITH as an app">
      <Glass>
        <p className="muted">
          EDITH installs as a <strong>web app (PWA)</strong> — it appears on your home screen and opens
          full-screen like an app, with its own icon. It is <strong>not</strong> a native App Store or
          Play Store app, and there is no store listing to download. You need to open the site over
          HTTPS (the live site already is) for the browser to offer installation.
        </p>
        <InstallApp />
        <h3>Android (Chrome)</h3>
        <ol>
          <li>Open <Link href="/">edith-ai-delta.vercel.app</Link> in Chrome.</li>
          <li>Tap the install button above if it appears, or tap the browser menu (⋮) → <strong>Install app</strong> or <strong>Add to Home Screen</strong>.</li>
          <li>Confirm <strong>Install</strong>. EDITH appears on your home screen with its icon.</li>
        </ol>
        <h3>iPhone / iPad (Safari)</h3>
        <ol>
          <li>Open the site in Safari (installation only works from Safari, not from Chrome on iOS).</li>
          <li>Tap <strong>Share</strong> (the square with an arrow at the bottom).</li>
          <li>Tap <strong>Add to Home Screen</strong> → <strong>Add</strong>.</li>
        </ol>
        <h3>What works offline</h3>
        <p className="muted">
          The app shell opens offline, but chat, vision, image generation and your saved data all need
          an internet connection — nothing is faked offline, and the service worker never caches
          your private data or any <code>/api/</code> response.
        </p>
        <p><Link href="/">← Back to the home page</Link></p>
      </Glass>
    </AppShell>
  );
}
