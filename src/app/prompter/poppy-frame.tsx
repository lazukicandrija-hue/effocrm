"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Loader2, Download, Copy, Check, Wand2, Link2, ArrowRight, AlertTriangle } from "lucide-react";

// First Frame → Poppy: reel link → first frame → Airtable image-edit → Poppy image.
// Jobs are persisted server-side and finalized by the 24/7 tick loop, so results come
// back even after a refresh or closing the tab. This just shows the queue.
type Job = {
  id: string;
  status: "WORKING" | "DONE" | "FAILED";
  sourceUrl: string;
  error: string | null;
  createdAt: string;
  source: string | null; // presigned source-frame URL
  url: string | null; // presigned Poppy result URL
};

export default function PoppyFrame() {
  const [url, setUrl] = useState("");
  const [prompt, setPrompt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [items, setItems] = useState<Job[]>([]);
  const [copied, setCopied] = useState<string | null>(null); // "img:<id>" | "link:<id>"

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/first-frame/poppy");
      const d = await r.json();
      if (Array.isArray(d.items)) setItems(d.items);
    } catch {
      /* keep prior */
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Poll every 5s only while something is still working; stop when the queue settles.
  const hasWorking = items.some((i) => i.status === "WORKING");
  useEffect(() => {
    if (!hasWorking) return;
    const iv = setInterval(load, 5000);
    return () => clearInterval(iv);
  }, [hasWorking, load]);

  const start = async () => {
    if (!url.trim() || submitting) return;
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/first-frame/poppy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim(), prompt: prompt.trim() || undefined }),
      });
      const d = await res.json();
      if (!res.ok || !d.id) throw new Error(d.error || "Couldn't start the image-edit.");
      setUrl("");
      await load();
    } catch (e: any) {
      setError(e?.message || "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  };

  const copyImage = async (job: Job) => {
    if (!job.url) return;
    try {
      const blob = await (await fetch(job.url)).blob();
      const bitmap = await createImageBitmap(blob);
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error();
      ctx.drawImage(bitmap, 0, 0);
      const png: Blob = await new Promise((res, rej) =>
        canvas.toBlob((b) => (b ? res(b) : rej(new Error())), "image/png")
      );
      await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
      setCopied("img:" + job.id);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      alert("Couldn't copy the image — use Copy link or Download.");
    }
  };

  const copyLink = async (job: Job) => {
    if (!job.url) return;
    try {
      await navigator.clipboard.writeText(job.url);
      setCopied("link:" + job.id);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      alert("Couldn't copy the link.");
    }
  };

  const download = async (job: Job) => {
    if (!job.url) return;
    try {
      const blob = await (await fetch(job.url)).blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = "poppy-frame.jpg";
      a.click();
      URL.revokeObjectURL(href);
    } catch {
      window.open(job.url, "_blank");
    }
  };

  const btnGhost =
    "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-white/10 bg-white/5 text-gray-200 hover:bg-white/10 transition-colors";

  return (
    <div className="mt-10 pt-8 border-t border-white/10">
      <h2 className="text-lg font-semibold flex items-center gap-2" style={{ color: "#f5e6c8" }}>
        <Wand2 className="h-5 w-5" style={{ color: "#d4a853" }} /> Turn it into Poppy
      </h2>
      <p className="text-sm text-gray-400 mt-1 mb-5">
        Paste a reel link — it grabs the first frame, runs it through the image-edit workflow, and hands
        you back the same frame as <span className="text-[#d4a853]">Poppy</span>. It runs in the
        background, so you can close this and come back — the result waits for you right here.
      </p>

      {/* Input */}
      <div className="rounded-xl border border-white/5 bg-white/[0.02] p-5 space-y-3">
        <div className="flex gap-2">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && start()}
            disabled={submitting}
            placeholder="https://www.instagram.com/reel/…  or  tiktok.com/…"
            className="flex-1 px-3 py-2.5 rounded-lg bg-white/5 border border-white/10 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-[#d4a853]/50 disabled:opacity-50"
          />
          <button
            onClick={start}
            disabled={submitting || !url.trim()}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium flex-shrink-0 bg-[#d4a853] text-black hover:bg-[#e0b863] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
            {submitting ? "Grabbing frame…" : "Make Poppy frame"}
          </button>
        </div>
        <input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          disabled={submitting}
          placeholder="Optional edit note — default: make her blonde, remove any on-screen text"
          className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-xs text-gray-300 placeholder-gray-600 focus:outline-none focus:border-[#d4a853]/50 disabled:opacity-50"
        />
        {error && (
          <div className="flex items-start gap-2 text-sm text-red-400">
            <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* Queue */}
      {items.length > 0 && (
        <div className="mt-4 space-y-3">
          {items.map((job) => (
            <div key={job.id} className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
              {job.status === "DONE" && job.url ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-center gap-3">
                    {job.source && (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={job.source} alt="original" className="h-24 rounded-lg border border-white/10 bg-black object-contain" />
                        <ArrowRight className="h-5 w-5 text-gray-500 flex-shrink-0" />
                      </>
                    )}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={job.url} alt="Poppy" className="max-h-[46vh] rounded-lg border-2 border-[#d4a853]/40 bg-black object-contain" />
                  </div>
                  <div className="flex flex-wrap justify-center gap-2">
                    <button
                      onClick={() => copyImage(job)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#d4a853] text-black hover:bg-[#e0b863]"
                    >
                      {copied === "img:" + job.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      {copied === "img:" + job.id ? "Copied!" : "Copy image"}
                    </button>
                    <button onClick={() => copyLink(job)} className={btnGhost}>
                      {copied === "link:" + job.id ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Link2 className="h-3.5 w-3.5" />} Copy link
                    </button>
                    <button onClick={() => download(job)} className={btnGhost}>
                      <Download className="h-3.5 w-3.5" /> Download
                    </button>
                  </div>
                </div>
              ) : job.status === "FAILED" ? (
                <div className="flex items-center gap-3">
                  {job.source && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={job.source} alt="original" className="h-16 rounded-md border border-white/10 bg-black object-contain flex-shrink-0" />
                  )}
                  <div className="flex items-start gap-2 text-sm text-red-400">
                    <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <span>{job.error || "The image-edit failed — often a content block. Try a different frame."}</span>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  {job.source ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={job.source} alt="original" className="h-16 rounded-md border border-white/10 bg-black object-contain flex-shrink-0" />
                  ) : (
                    <div className="h-16 w-12 rounded-md bg-white/5 flex-shrink-0" />
                  )}
                  <div className="flex items-center gap-2 text-sm text-amber-400/90">
                    <Loader2 className="h-4 w-4 animate-spin" /> Turning it into Poppy…
                    <span className="text-gray-500">usually 1–3 min (longer if the render queue is busy)</span>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
