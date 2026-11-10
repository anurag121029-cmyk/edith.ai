"use client";
import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isIOS(): boolean {
  if (typeof window === "undefined") return false;
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent) && !(window as unknown as { MSStream?: unknown }).MSStream;
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches || (window.navigator as unknown as { standalone?: boolean }).standalone === true;
}

// Install prompt for Android/Chrome (beforeinstallprompt) + manual
// "Add to Home Screen" instructions for iPhone/Safari, which has no prompt.
// This installs EDITH as a PWA (a web app on your home screen), not as a
// native store app — there is no App Store / Play Store listing.
export default function InstallApp() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [showIosHelp, setShowIosHelp] = useState(false);
  const [installResult, setInstallResult] = useState("");

  useEffect(() => {
    setInstalled(isStandalone());
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
      setInstallResult("EDITH is installed — look for it on your home screen.");
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function install() {
    if (!deferred) return;
    try {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      if (choice.outcome === "accepted") {
        setInstallResult("Installing EDITH… look for it on your home screen.");
      } else {
        setInstallResult("Install dismissed — you can install later from this button.");
      }
      setDeferred(null);
    } catch {
      setInstallResult("Install didn't start — try your browser menu → Add to Home Screen.");
    }
  }

  if (installed) return <p className="muted" role="status">EDITH is already installed on this device — you are running it as an app.</p>;

  return (
    <div aria-live="polite">
      {deferred ? (
        <p><button className="btn" onClick={install}>Install EDITH as an app</button></p>
      ) : isIOS() ? (
        <div>
          <p><button className="btn" onClick={() => setShowIosHelp((s) => !s)}>Get the EDITH app</button></p>
          {showIosHelp && (
            <p className="muted">
              On iPhone: open this site in Safari, tap <strong>Share</strong> (the square with an arrow), then tap{" "}
              <strong>Add to Home Screen</strong> → <strong>Add</strong>. EDITH will then open like a real app.
            </p>
          )}
        </div>
      ) : (
        <p className="muted">
          In Chrome on Android, tap the browser menu → <strong>Add to Home Screen</strong> (or <strong>Install app</strong> if it appears)
          to install EDITH as an app. On a desktop browser, use the install icon in the address bar.
        </p>
      )}
      {installResult && <p className="muted" role="status">{installResult}</p>}
    </div>
  );
}
