"use client";
import { useEffect, useRef, useState } from "react";

/**
 * Shared camera capture — used by chat and study sessions (the Image
 * page keeps its own copy, untouched, to avoid regressions).
 *
 * Two ways to take a photo:
 *  (a) "Take a photo" — a file input with capture="environment" that
 *      opens the device camera on phones.
 *  (b) "Live camera" — getUserMedia video preview, Capture draws the
 *      frame to a canvas (max dimension 1280, JPEG 0.85) and returns
 *      base64; Stop ends all tracks (also on unmount).
 *
 * The photo is NEVER stored anywhere: the preview is on-device only and
 * the base64 is handed to the caller, which sends it to /api/vision
 * only when the user asks about it. Permission denied / no camera →
 * a clear inline error and a note to use the take-photo option instead.
 */

const MAX_BYTES = 5_000_000;
const MAX_DIMENSION = 1280;

async function fileToBase64(f: File): Promise<{ base64: string; mimeType: string }> {
  const buf = await f.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return { base64: btoa(binary), mimeType: f.type || "image/jpeg" };
}

export default function CameraCapture({
  onCapture,
  onError,
  buttonLabel = "📷 Take a photo",
}: {
  onCapture: (base64: string, mimeType: string) => void;
  onError?: (message: string) => void;
  buttonLabel?: string;
}) {
  const [camOn, setCamOn] = useState(false);
  const [camErr, setCamErr] = useState("");
  const [camBusy, setCamBusy] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCamOn(false);
  }
  useEffect(() => () => { streamRef.current?.getTracks().forEach((t) => t.stop()); }, []);

  function fail(message: string) {
    setCamErr(message);
    if (onError) onError(message);
  }

  async function onFile(f: File) {
    if (f.size > MAX_BYTES) { fail("That photo is over 5MB — try a smaller one."); return; }
    try {
      const { base64, mimeType } = await fileToBase64(f);
      setCamErr("");
      onCapture(base64, mimeType);
    } catch {
      fail("That photo could not be read — try again or use a different photo.");
    }
  }

  async function startCamera() {
    setCamErr("");
    setCamBusy(true);
    if (!navigator.mediaDevices?.getUserMedia) {
      fail("Live camera is not available in this browser. Use Take a photo instead.");
      setCamBusy(false);
      return;
    }
    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
      }
      streamRef.current = stream;
      setCamOn(true);
      setTimeout(() => { if (videoRef.current) videoRef.current.srcObject = stream; }, 0);
    } catch {
      fail("Camera permission was denied or the camera could not be started. Use Take a photo instead.");
    } finally {
      setCamBusy(false);
    }
  }

  function capturePhoto() {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const scale = Math.min(1, MAX_DIMENSION / Math.max(v.videoWidth, v.videoHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(v.videoWidth * scale);
    c.height = Math.round(v.videoHeight * scale);
    c.getContext("2d")?.drawImage(v, 0, 0, c.width, c.height);
    const dataUrl = c.toDataURL("image/jpeg", 0.85);
    const base64 = dataUrl.split(",")[1] || "";
    if (!base64) { fail("The photo could not be captured — try again."); return; }
    stopCamera();
    setCamErr("");
    onCapture(base64, "image/jpeg");
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: "none" }}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); e.target.value = ""; }}
      />
      <p style={{ display: "flex", gap: ".5rem", flexWrap: "wrap" }}>
        <button type="button" className="btn btn-secondary" onClick={() => inputRef.current?.click()}>
          {buttonLabel}
        </button>
        <button type="button" className="btn btn-secondary" onClick={startCamera} disabled={camOn || camBusy}>
          {camBusy ? "Starting camera…" : "Use live camera"}
        </button>
      </p>
      {camErr && <p className="error" role="alert">{camErr}</p>}
      {camOn && (
        <div>
          <video ref={videoRef} autoPlay playsInline muted style={{ maxWidth: "100%", borderRadius: 16 }} />
          <p style={{ display: "flex", gap: ".5rem", flexWrap: "wrap" }}>
            <button type="button" className="btn" onClick={capturePhoto}>📷 Capture photo</button>
            <button type="button" className="btn btn-secondary" onClick={stopCamera}>Stop camera</button>
          </p>
        </div>
      )}
      <p className="muted" style={{ fontSize: ".85rem" }}>
        The preview stays on your device; the photo is sent to the AI only for the question you ask about it, and is never stored.
      </p>
    </div>
  );
}
