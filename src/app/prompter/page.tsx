"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

type Result = {
  prompt: string;
  description: string;
  firstFrame: string;
  transcript: string;
};

export default function PrompterPage() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  async function generate() {
    const u = url.trim();
    if (!u) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/prompter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: u }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error || "Failed.");
      else setResult(data);
    } catch (e: any) {
      setError(e?.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  function flash(key: string) {
    setCopied(key);
    setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
  }

  function copyText(text: string, key: string) {
    navigator.clipboard.writeText(text).then(() => flash(key));
  }

  // Copy the frame as a real image (PNG) so it can be pasted into Airtable etc.
  async function copyImage(b64: string) {
    try {
      const img = new Image();
      img.src = `data:image/jpeg;base64,${b64}`;
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("canvas unavailable");
      ctx.drawImage(img, 0, 0);
      const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("encode failed");
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      flash("img");
    } catch {
      setError("Couldn't copy the image directly — use Download instead.");
    }
  }

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <button
        onClick={() => router.back()}
        className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-[#f5e6c8] mb-4 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      <h1 className="text-2xl font-semibold" style={{ color: "#f5e6c8" }}>
        Seedance Prompter
      </h1>
      <p className="text-sm text-gray-400 mt-1 mb-5">
        Paste any reel, TikTok, or Shorts link — get a ready-to-use Seedance prompt plus the
        video&apos;s first frame (start image / Airtable cover).
      </p>

      <div className="flex gap-2 mb-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !loading && generate()}
          placeholder="https://www.instagram.com/reel/…"
          className="flex-1 px-3 py-2.5 rounded-lg bg-white/5 border border-white/10 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-[#d4a853]/50"
        />
        <button
          onClick={generate}
          disabled={loading || !url.trim()}
          className="px-4 py-2.5 rounded-lg text-sm font-medium flex-shrink-0 transition-colors bg-[#d4a853]/15 text-[#d4a853] hover:bg-[#d4a853]/25 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Analyzing…" : "Generate"}
        </button>
      </div>

      {loading && (
        <p className="text-xs text-amber-400/80 mb-4">
          ⏳ Downloading and analyzing the video — this takes ~1–2 minutes. Keep this tab open.
        </p>
      )}
      {error && <p className="text-sm text-red-400 mb-4">{error}</p>}

      {result && (
        <div className="mt-4 space-y-4">
          {result.firstFrame && (
            <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
              <p className="text-xs uppercase tracking-wide text-gray-500 mb-2">First frame</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`data:image/jpeg;base64,${result.firstFrame}`}
                alt="First frame"
                className="rounded-lg max-h-80 w-auto border border-white/10"
              />
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => copyImage(result.firstFrame)}
                  className="text-xs px-3 py-1.5 rounded-lg bg-white/5 text-gray-300 hover:bg-white/10"
                >
                  {copied === "img" ? "✓ Copied" : "📋 Copy image"}
                </button>
                <a
                  href={`data:image/jpeg;base64,${result.firstFrame}`}
                  download="first-frame.jpg"
                  className="text-xs px-3 py-1.5 rounded-lg bg-white/5 text-gray-300 hover:bg-white/10"
                >
                  ⬇ Download
                </a>
              </div>
            </div>
          )}

          <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs uppercase tracking-wide text-gray-500">Seedance prompt</p>
              <button
                onClick={() => copyText(result.prompt, "prompt")}
                className="text-xs px-2.5 py-1 rounded bg-[#d4a853]/15 text-[#d4a853] hover:bg-[#d4a853]/25"
              >
                {copied === "prompt" ? "✓ Copied" : "📋 Copy"}
              </button>
            </div>
            <p className="text-sm text-gray-200 whitespace-pre-wrap">{result.prompt}</p>
          </div>

          {result.description && (
            <details className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
              <summary className="text-xs uppercase tracking-wide text-gray-500 cursor-pointer">
                What happens in the video
              </summary>
              <p className="text-sm text-gray-300 whitespace-pre-wrap mt-2">{result.description}</p>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
