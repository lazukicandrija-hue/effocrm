"use client";

import { useState, useCallback, useEffect } from "react";
import DashboardLayout from "@/components/layout/dashboard-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Brain, Sparkles, Copy, Check, Loader2, Images, RefreshCw } from "lucide-react";

const FALLBACK_NICHES = ["McDonald's", "Starbucks", "Chipotle", "Waitress", "Delivery Girl", "Cashier"];

type Idea = {
  hook: string;
  concept: string;
  niche: string;
  seedancePrompt: string;
  referenceImage: string;
  why: string;
};

export default function BrainPage() {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [niche, setNiche] = useState("all");
  const [refine, setRefine] = useState("");
  const [copied, setCopied] = useState<number | null>(null);
  const [grounded, setGrounded] = useState<boolean | null>(null);
  const [niches, setNiches] = useState<string[]>(FALLBACK_NICHES);

  useEffect(() => {
    fetch("/api/brain/ideas")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.niches) && d.niches.length) setNiches(d.niches);
      })
      .catch(() => {
        /* keep fallback */
      });
  }, []);

  const generate = useCallback(
    async (append: boolean) => {
      setLoading(true);
      setError(null);
      try {
        const r = await fetch("/api/brain/ideas", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            count: 6,
            niche: niche === "all" ? null : niche,
            refine: refine.trim() || null,
          }),
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Generation failed");
        const got: Idea[] = Array.isArray(d.ideas) ? d.ideas : [];
        if (!got.length) throw new Error("The brain didn't return any ideas — try again.");
        setGrounded(!!d.grounded);
        setIdeas((prev) => (append ? [...prev, ...got] : got));
      } catch (e: any) {
        setError(e?.message || "Something went wrong.");
      } finally {
        setLoading(false);
      }
    },
    [niche, refine]
  );

  const copyPrompt = async (i: number, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(i);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      alert("Couldn't copy — select the text and copy it manually.");
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Brain className="h-6 w-6" /> Content Brain
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Reel ideas + ready-to-paste Seedance prompts, tuned to what&apos;s actually landing on your
            accounts. Every prompt is motion-only (no looks described) and copy-paste ready for Airtable.
          </p>
        </div>

        {/* Controls */}
        <Card>
          <CardContent className="p-5 space-y-3">
            <div className="flex flex-wrap items-end gap-4">
              <div className="space-y-1.5">
                <Label>Niche</Label>
                <select
                  value={niche}
                  onChange={(e) => setNiche(e.target.value)}
                  className="h-9 w-44 rounded-md border border-gray-200 px-3 text-sm bg-white"
                >
                  <option value="all">All niches</option>
                  {niches.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5 flex-1 min-w-[220px]">
                <Label>Steer it (optional)</Label>
                <input
                  value={refine}
                  onChange={(e) => setRefine(e.target.value)}
                  placeholder='e.g. "spicier hooks", "golf course POV", "trending audio angle"'
                  className="h-9 w-full rounded-md border border-gray-200 px-3 text-sm bg-white"
                  onKeyDown={(e) => e.key === "Enter" && !loading && generate(false)}
                />
              </div>
              <Button
                onClick={() => generate(false)}
                disabled={loading}
                className="h-9 gap-2"
                style={{ backgroundColor: "#0a0a0a", color: "#f5e6c8" }}
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {loading ? "Thinking…" : "Generate ideas"}
              </Button>
            </div>
            {grounded === false && ideas.length > 0 && (
              <p className="text-xs text-amber-600">
                Heads up: no scraped reel data yet, so these lean on niche best-practices rather than your
                numbers. Run a scrape for sharper, data-backed ideas.
              </p>
            )}
          </CardContent>
        </Card>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Empty state */}
        {!loading && ideas.length === 0 && !error && (
          <div className="text-center py-16 text-gray-400">
            <Brain className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm">
              Pick a niche (or leave it on All), add any steer, and hit <b>Generate ideas</b>.
            </p>
          </div>
        )}

        {/* Loading skeleton on first run */}
        {loading && ideas.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <Loader2 className="h-8 w-8 mx-auto mb-3 animate-spin" />
            <p className="text-sm">Reading your top reels and reference library…</p>
          </div>
        )}

        {/* Cards */}
        {ideas.length > 0 && (
          <div className="space-y-4">
            {ideas.map((idea, i) => (
              <Card key={i} className="overflow-hidden">
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    {idea.niche && (
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#0a0a0a] text-[#f5e6c8]">
                        {idea.niche}
                      </span>
                    )}
                    {idea.why && <span className="text-[11px] text-gray-400">{idea.why}</span>}
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold">Hook</p>
                    <p className="text-lg font-bold text-gray-900 leading-snug">{idea.hook}</p>
                  </div>
                  {idea.concept && <p className="text-sm text-gray-600">{idea.concept}</p>}
                  <div className="rounded-lg bg-gray-50 border border-gray-100 p-3">
                    <div className="flex items-center justify-between mb-1.5 gap-2">
                      <p className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold">
                        Seedance prompt
                      </p>
                      <button
                        onClick={() => copyPrompt(i, idea.seedancePrompt)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold text-white flex-shrink-0"
                        style={{ backgroundColor: "#d4a853" }}
                      >
                        {copied === i ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                        {copied === i ? "Copied" : "Copy prompt"}
                      </button>
                    </div>
                    <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">
                      {idea.seedancePrompt}
                    </p>
                  </div>
                  {idea.referenceImage && (
                    <a
                      href="/reference-images"
                      className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-[#d4a853]"
                    >
                      <Images className="h-3.5 w-3.5" /> Start from:{" "}
                      <b className="font-semibold">{idea.referenceImage}</b>
                    </a>
                  )}
                </CardContent>
              </Card>
            ))}
            <div className="flex justify-center pt-1">
              <Button onClick={() => generate(true)} disabled={loading} variant="outline" className="gap-2">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                {loading ? "Thinking…" : "Generate 6 more"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
