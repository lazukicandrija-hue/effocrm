"use client";

import { useEffect, useRef, useState } from "react";
import DashboardLayout from "@/components/layout/dashboard-layout";
import { Loader2, Upload, Download, RotateCcw, Film, AlertTriangle, Copy, Check } from "lucide-react";

// Grab the opening frame of a video File entirely in the browser (instant, private).
// Seeks a hair past 0 so a real decoded frame is guaranteed across browsers.
function extractFirstFrame(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    (video as any).playsInline = true;
    let settled = false;
    const done = (fn: () => void) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      fn();
    };
    const draw = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth || 720;
        canvas.height = video.videoHeight || 1280;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("no canvas context");
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (blob) => done(() => (blob ? resolve(blob) : reject(new Error("Couldn't render the frame.")))),
          "image/jpeg",
          0.92
        );
      } catch (e) {
        done(() => reject(e as Error));
      }
    };
    video.onloadeddata = () => {
      try {
        video.currentTime = Math.min(0.06, (video.duration || 1) / 2);
      } catch {
        draw();
      }
    };
    video.onseeked = draw;
    video.onerror = () =>
      done(() => reject(new Error("The browser couldn't read this video — try the link, or a different file.")));
    video.src = url;
  });
}

function b64ToBlob(b64: string, type = "image/jpeg"): Blob {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type });
}

// Safely read the /api/first-frame response — a gateway timeout can return an HTML
// error page, so never assume the body is JSON.
async function readFrameResponse(
  res: Response
): Promise<{ image?: string; contentType?: string; error?: string }> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

export default function FirstFramePage() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState("");
  const [resultUrl, setResultUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const resultBlob = useRef<Blob | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearInterval(timer.current);
      if (resultUrl) URL.revokeObjectURL(resultUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startTimer = () => {
    setElapsed(0);
    const t0 = performance.now();
    timer.current = setInterval(() => setElapsed(Math.floor((performance.now() - t0) / 1000)), 250);
  };
  const stopTimer = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };

  const showResult = (blob: Blob) => {
    resultBlob.current = blob;
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    setResultUrl(URL.createObjectURL(blob));
  };

  const reset = () => {
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    setResultUrl("");
    resultBlob.current = null;
    setError("");
    setUrl("");
  };

  const handleLink = async () => {
    if (!url.trim() || loading) return;
    setError("");
    setLoading(true);
    startTimer();
    try {
      const res = await fetch("/api/first-frame", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await readFrameResponse(res);
      if (!res.ok || !data.image)
        throw new Error(
          data.error ||
            "Couldn't fetch that reel — the link download is down right now. Use the Upload option below (it's instant), or try again."
        );
      showResult(b64ToBlob(data.image, data.contentType || "image/jpeg"));
    } catch (e: any) {
      setError(e?.message || "Something went wrong.");
    } finally {
      stopTimer();
      setLoading(false);
    }
  };

  const handleFile = async (file: File | null) => {
    if (!file || loading) return;
    setError("");
    setLoading(true);
    startTimer();
    try {
      const blob = await extractFirstFrame(file); // fast path: in the browser
      showResult(blob);
    } catch {
      try {
        const fd = new FormData(); // fallback: let the service decode odd formats
        fd.append("file", file, file.name || "upload.mp4");
        const res = await fetch("/api/first-frame", { method: "POST", body: fd });
        const data = await readFrameResponse(res);
        if (!res.ok || !data.image) throw new Error(data.error || "Couldn't read this file.");
        showResult(b64ToBlob(data.image, data.contentType || "image/jpeg"));
      } catch (e: any) {
        setError(e?.message || "Couldn't read this file.");
      }
    } finally {
      stopTimer();
      setLoading(false);
    }
  };

  const download = () => {
    if (!resultBlob.current) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(resultBlob.current);
    a.download = "first-frame.jpg";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  // Copy the frame to the clipboard. Clipboard image-write needs PNG, so re-encode.
  const copyImage = async () => {
    if (!resultBlob.current) return;
    setError("");
    try {
      const bitmap = await createImageBitmap(resultBlob.current);
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("no context");
      ctx.drawImage(bitmap, 0, 0);
      const png: Blob = await new Promise((resolve, rej) =>
        canvas.toBlob((b) => (b ? resolve(b) : rej(new Error("encode failed"))), "image/png")
      );
      await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Couldn't copy the image — use Download instead.");
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-semibold" style={{ color: "#f5e6c8" }}>
          First Frame
        </h1>
        <p className="text-sm text-gray-400 mt-1 mb-6">
          Paste a reel link or upload the reel file, and get its opening frame — fast.
        </p>

        {resultUrl ? (
          <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4 space-y-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={resultUrl}
              alt="First frame"
              className="w-full max-h-[68vh] object-contain rounded-lg border border-white/10 bg-black"
            />
            <div className="flex justify-center gap-3">
              <button
                onClick={download}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-[#d4a853] text-black hover:bg-[#e0b863] transition-colors"
              >
                <Download className="h-4 w-4" /> Download
              </button>
              <button
                onClick={copyImage}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border border-white/10 bg-white/5 text-gray-200 hover:bg-white/10 transition-colors"
              >
                {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                {copied ? "Copied!" : "Copy image"}
              </button>
              <button
                onClick={reset}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border border-white/10 bg-white/5 text-gray-200 hover:bg-white/10 transition-colors"
              >
                <RotateCcw className="h-4 w-4" /> Do another
              </button>
            </div>
            {error && <p className="text-center text-xs text-red-400">{error}</p>}
          </div>
        ) : (
          <div className="rounded-xl border border-white/5 bg-white/[0.02] p-5 space-y-5">
            {/* Link */}
            <div className="flex gap-2">
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleLink()}
                disabled={loading}
                placeholder="https://www.instagram.com/reel/…  or  tiktok.com/…"
                className="flex-1 px-3 py-2.5 rounded-lg bg-white/5 border border-white/10 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-[#d4a853]/50 disabled:opacity-50"
              />
              <button
                onClick={handleLink}
                disabled={loading || !url.trim()}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium flex-shrink-0 bg-[#d4a853]/15 text-[#d4a853] hover:bg-[#d4a853]/25 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Film className="h-4 w-4" />}
                Get frame
              </button>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-white/10" />
              <span className="text-xs text-gray-600">or</span>
              <div className="flex-1 h-px bg-white/10" />
            </div>

            {/* File */}
            <button
              onClick={() => fileRef.current?.click()}
              disabled={loading}
              className="w-full flex flex-col items-center justify-center gap-2 py-8 rounded-lg border-2 border-dashed border-white/15 text-gray-300 hover:border-[#d4a853]/50 hover:text-[#f5e6c8] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Upload className="h-6 w-6" />
              <span className="text-sm font-medium">Upload the reel file</span>
              <span className="text-[11px] text-gray-500">Read right here in your browser — instant</span>
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0] || null;
                e.target.value = "";
                handleFile(f);
              }}
            />

            {loading && (
              <div className="flex items-center justify-center gap-2 text-sm text-amber-400/90">
                <Loader2 className="h-4 w-4 animate-spin" />
                Getting the first frame… {elapsed}s
              </div>
            )}
            {error && (
              <div className="flex items-start gap-2 text-sm text-red-400">
                <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
