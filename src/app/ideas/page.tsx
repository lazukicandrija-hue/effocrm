"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

type Idea = {
  id: string;
  source: "AI" | "MANUAL";
  title: string;
  concept: string | null;
  prompt: string | null;
  isRecreate: boolean;
  status: string;
  sourceReel: {
    shortcode: string;
    thumbnailUrl: string | null;
    currentViews: number;
    account: { igUsername: string | null; username: string };
  } | null;
  createdAt: string;
};

export default function IdeasPage() {
  const router = useRouter();
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"AI" | "MANUAL">("AI");
  const [generating, setGenerating] = useState(false);
  const [genMsg, setGenMsg] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newConcept, setNewConcept] = useState("");
  const [busy, setBusy] = useState<Record<string, "prompt" | undefined>>({});
  const [copied, setCopied] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const d = await (await fetch("/api/ideas")).json();
      setIdeas(d.ideas || []);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function generate() {
    setGenerating(true);
    setGenMsg(null);
    try {
      const res = await fetch("/api/ideas/generate", { method: "POST" });
      const d = await res.json();
      if (!res.ok) setGenMsg(d.error || "Failed.");
      else {
        setGenMsg(`Generated ${d.created} new ideas.`);
        setTab("AI");
        await load();
      }
    } catch (e: any) {
      setGenMsg(e?.message || "Failed.");
    } finally {
      setGenerating(false);
    }
  }

  async function addManual() {
    if (!newTitle.trim()) return;
    await fetch("/api/ideas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newTitle, concept: newConcept }),
    });
    setNewTitle("");
    setNewConcept("");
    await load();
  }

  async function getPrompt(idea: Idea) {
    if (!idea.sourceReel) return;
    setBusy((b) => ({ ...b, [idea.id]: "prompt" }));
    try {
      const url = `https://www.instagram.com/reel/${idea.sourceReel.shortcode}/`;
      const res = await fetch("/api/insights/recreate-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const d = await res.json();
      if (res.ok && d.prompt) {
        await fetch(`/api/ideas/${idea.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: d.prompt }),
        });
        setIdeas((arr) => arr.map((x) => (x.id === idea.id ? { ...x, prompt: d.prompt } : x)));
      } else {
        alert(d.error || "Couldn't generate the prompt.");
      }
    } finally {
      setBusy((b) => ({ ...b, [idea.id]: undefined }));
    }
  }

  async function del(id: string) {
    await fetch(`/api/ideas/${id}`, { method: "DELETE" });
    setIdeas((arr) => arr.filter((x) => x.id !== id));
  }

  function copy(id: string, text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(id);
      setTimeout(() => setCopied(null), 1500);
    });
  }

  const shown = ideas.filter((i) => i.source === tab);

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <button
        onClick={() => router.back()}
        className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-[#f5e6c8] mb-4 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Back
      </button>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: "#f5e6c8" }}>
            Ideas
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            AI-generated from what&apos;s winning, plus your own. Each can produce a ready Seedance prompt.
          </p>
        </div>
        <button
          onClick={generate}
          disabled={generating}
          className="px-4 py-2 rounded-lg text-sm font-medium bg-[#d4a853] text-black hover:bg-[#e0b863] disabled:opacity-60 disabled:cursor-wait"
        >
          {generating ? "Generating…" : "✨ Generate AI ideas"}
        </button>
      </div>

      {genMsg && <p className="text-xs text-amber-400/90 mb-4">{genMsg}</p>}

      <div className="flex gap-2 mb-4 border-b border-white/5">
        {(["AI", "MANUAL"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t ? "border-[#d4a853] text-[#d4a853]" : "border-transparent text-gray-400 hover:text-gray-200"
            }`}
          >
            {t === "AI" ? "AI Ideas" : "My Ideas"}
          </button>
        ))}
      </div>

      {tab === "MANUAL" && (
        <div className="flex gap-2 mb-4">
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="New idea title…"
            className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-500"
          />
          <input
            value={newConcept}
            onChange={(e) => setNewConcept(e.target.value)}
            placeholder="(optional) notes"
            className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-500"
          />
          <button onClick={addManual} className="px-3 py-2 rounded-lg text-sm bg-white/10 text-gray-200 hover:bg-white/20">
            Add
          </button>
        </div>
      )}

      {loading ? (
        <p className="text-gray-500">Loading…</p>
      ) : shown.length === 0 ? (
        <p className="text-gray-500">
          {tab === "AI"
            ? "No AI ideas yet — hit “Generate AI ideas” to get suggestions from your top reels."
            : "No ideas of your own yet — add one above."}
        </p>
      ) : (
        <div className="space-y-3">
          {shown.map((idea) => (
            <div key={idea.id} className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-semibold" style={{ color: "#f5e6c8" }}>
                      {idea.title}
                    </h3>
                    {idea.isRecreate && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#d4a853]/15 text-[#d4a853]">recreate</span>
                    )}
                    {idea.sourceReel && (
                      <a
                        href={`https://www.instagram.com/reel/${idea.sourceReel.shortcode}/`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[10px] text-gray-400 hover:underline"
                      >
                        @{idea.sourceReel.account.igUsername || idea.sourceReel.account.username} ·{" "}
                        {idea.sourceReel.currentViews.toLocaleString()} views
                      </a>
                    )}
                  </div>
                  {idea.concept && <p className="text-xs text-gray-400 mt-1">{idea.concept}</p>}
                </div>
                <button onClick={() => del(idea.id)} className="text-gray-600 hover:text-red-400 text-sm flex-shrink-0">
                  🗑️
                </button>
              </div>

              {idea.prompt ? (
                <div className="mt-3 rounded-lg bg-black/30 border border-white/5 p-3">
                  <p className="text-sm text-gray-200 whitespace-pre-wrap">{idea.prompt}</p>
                  <button
                    onClick={() => copy(idea.id, idea.prompt!)}
                    className="mt-2 text-xs px-2.5 py-1 rounded bg-white/5 text-gray-300 hover:bg-white/10"
                  >
                    {copied === idea.id ? "✓ Copied" : "📋 Copy"}
                  </button>
                </div>
              ) : idea.sourceReel ? (
                <button
                  onClick={() => getPrompt(idea)}
                  disabled={busy[idea.id] === "prompt"}
                  className="mt-3 text-xs px-3 py-1.5 rounded-lg bg-[#d4a853]/15 text-[#d4a853] hover:bg-[#d4a853]/25 disabled:opacity-60 disabled:cursor-wait"
                >
                  {busy[idea.id] === "prompt" ? "Generating prompt… (~2 min)" : "Get Seedance prompt →"}
                </button>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
