"use client";

import { useEffect, useState } from "react";

type Reel = {
  id: string;
  shortcode: string;
  url: string;
  caption: string | null;
  thumbnailUrl: string | null;
  account: string;
  niche: string[];
  publishedAt: string | null;
  views: number;
  likes: number;
  comments: number;
  viewsGained: number | null;
  overIndex: number;
  score: number;
};

type Gen = { loading?: boolean; prompt?: string; error?: string; copied?: boolean };

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

export default function WhatsWorkingPage() {
  const [reels, setReels] = useState<Reel[]>([]);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState<string | null>(null);
  const [days, setDays] = useState(7);
  const [gen, setGen] = useState<Record<string, Gen>>({});

  useEffect(() => {
    let live = true;
    setLoading(true);
    fetch(`/api/insights/top-performers?days=${days}&limit=40`)
      .then((r) => r.json())
      .then((d) => {
        if (!live) return;
        setReels(d.reels || []);
        setNote(d.note || null);
      })
      .catch(() => live && setReels([]))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [days]);

  async function recreate(reel: Reel) {
    setGen((g) => ({ ...g, [reel.id]: { loading: true } }));
    try {
      const res = await fetch("/api/insights/recreate-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: reel.url }),
      });
      const data = await res.json();
      if (!res.ok) {
        setGen((g) => ({ ...g, [reel.id]: { error: data.error || "Failed." } }));
      } else {
        setGen((g) => ({ ...g, [reel.id]: { prompt: data.prompt } }));
      }
    } catch (e: any) {
      setGen((g) => ({ ...g, [reel.id]: { error: e?.message || "Failed." } }));
    }
  }

  function copy(id: string, text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setGen((g) => ({ ...g, [id]: { ...g[id], copied: true } }));
      setTimeout(() => setGen((g) => ({ ...g, [id]: { ...g[id], copied: false } })), 1500);
    });
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold" style={{ color: "#f5e6c8" }}>
          What&apos;s Working
        </h1>
        <p className="text-sm text-gray-400 mt-1">
          Your top reels — ranked by views, momentum, and how much they beat each account&apos;s own baseline.
        </p>
      </div>

      <div className="flex gap-2 mb-4">
        {[7, 14, 30].map((d) => (
          <button
            key={d}
            onClick={() => setDays(d)}
            className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
              days === d ? "bg-[#d4a853]/20 text-[#d4a853]" : "text-gray-400 hover:bg-white/5"
            }`}
          >
            Last {d}d
          </button>
        ))}
      </div>

      {note && <p className="text-xs text-amber-400/80 mb-4">ℹ️ {note}</p>}

      {loading ? (
        <p className="text-gray-500">Loading…</p>
      ) : reels.length === 0 ? (
        <p className="text-gray-500">
          No reel data yet — once the daily scrape runs, your top performers show up here.
        </p>
      ) : (
        <div className="space-y-2">
          {reels.map((r, i) => {
            const g = gen[r.id] || {};
            return (
              <div key={r.id} className="rounded-xl border border-white/5 bg-white/[0.02]">
                <div className="flex items-center gap-4 p-3">
                  <span className="text-lg font-semibold text-gray-600 w-6 text-center flex-shrink-0">
                    {i + 1}
                  </span>
                  {r.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`/api/img-proxy?url=${encodeURIComponent(r.thumbnailUrl)}`}
                      alt=""
                      className="w-12 h-16 object-cover rounded-lg flex-shrink-0 bg-white/5"
                    />
                  ) : (
                    <div className="w-12 h-16 rounded-lg bg-white/5 flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <a
                        href={r.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm font-medium hover:underline"
                        style={{ color: "#f5e6c8" }}
                      >
                        @{r.account}
                      </a>
                      {r.overIndex >= 2 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#d4a853]/15 text-[#d4a853]">
                          {r.overIndex}× baseline
                        </span>
                      )}
                      {r.niche?.slice(0, 2).map((n) => (
                        <span key={n} className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-gray-400">
                          {n}
                        </span>
                      ))}
                    </div>
                    {r.caption && <p className="text-xs text-gray-500 truncate mt-0.5">{r.caption}</p>}
                    <div className="flex gap-3 text-xs text-gray-400 mt-1">
                      <span>▶ {fmt(r.views)} views</span>
                      <span>♥ {fmt(r.likes)}</span>
                      {r.viewsGained != null && (
                        <span className="text-emerald-400">+{fmt(r.viewsGained)} this period</span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => recreate(r)}
                    disabled={g.loading}
                    className="text-xs px-3 py-1.5 rounded-lg flex-shrink-0 transition-colors bg-[#d4a853]/15 text-[#d4a853] hover:bg-[#d4a853]/25 disabled:opacity-50 disabled:cursor-wait"
                  >
                    {g.loading ? "Generating… (~2 min)" : "Recreate prompt →"}
                  </button>
                </div>

                {(g.prompt || g.error) && (
                  <div className="px-4 pb-3 pl-16">
                    {g.error ? (
                      <p className="text-xs text-red-400">{g.error}</p>
                    ) : (
                      <div className="rounded-lg bg-black/30 border border-white/5 p-3">
                        <p className="text-sm text-gray-200 whitespace-pre-wrap">{g.prompt}</p>
                        <button
                          onClick={() => copy(r.id, g.prompt!)}
                          className="mt-2 text-xs px-2.5 py-1 rounded bg-white/5 text-gray-300 hover:bg-white/10"
                        >
                          {g.copied ? "✓ Copied" : "📋 Copy"}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
