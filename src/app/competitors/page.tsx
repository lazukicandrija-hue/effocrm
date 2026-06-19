"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ExternalLink, Trash2, RefreshCw } from "lucide-react";
import DashboardLayout from "@/components/layout/dashboard-layout";

type Comp = {
  id: string;
  username: string;
  igUsername: string | null;
  followers: number;
  niche: string[];
  lastSyncedAt: string | null;
  _count: { reels: number };
};

const NICHES = ["Golf", "Talking", "Omegle", "Podcast", "Dancing", "Motion Control"];
const NICHE_COLORS: Record<string, string> = {
  Golf: "#22c55e",
  Talking: "#3b82f6",
  Omegle: "#a855f7",
  Podcast: "#f59e0b",
  Dancing: "#ec4899",
  "Motion Control": "#14b8a6",
};
const PALETTE = ["#6366f1", "#ef4444", "#0ea5e9", "#f97316", "#8b5cf6", "#10b981", "#eab308", "#db2777"];
function nicheColor(n: string): string {
  if (NICHE_COLORS[n]) return NICHE_COLORS[n];
  let h = 0;
  for (let i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export default function CompetitorsPage() {
  const router = useRouter();
  const [list, setList] = useState<Comp[]>([]);
  const [handle, setHandle] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      setList((await (await fetch("/api/competitors")).json()).competitors || []);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function add() {
    if (!handle.trim()) return;
    setAdding(true);
    try {
      const res = await fetch("/api/competitors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ igUsername: handle, niche: picked }),
      });
      if (res.ok) {
        setHandle("");
        setPicked([]);
        await load();
      } else {
        alert((await res.json()).error || "Failed to add.");
      }
    } finally {
      setAdding(false);
    }
  }

  async function remove(id: string) {
    await fetch("/api/competitors", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setList((l) => l.filter((c) => c.id !== id));
  }

  // "Update": ask the VPS scraper for an on-demand run (scrapes all tracked accounts,
  // competitors included), then poll the list until a fresh sync lands.
  async function update() {
    if (refreshing) return;
    const baseline = Math.max(
      0,
      ...list.map((c) => (c.lastSyncedAt ? new Date(c.lastSyncedAt).getTime() : 0))
    );
    setRefreshing(true);
    setNote("Scrape requested — waiting for your scraper to run (can take a few minutes)…");
    try {
      const res = await fetch("/api/scraper/request-refresh", { method: "POST" });
      if (!res.ok) throw new Error();
    } catch {
      setRefreshing(false);
      setNote(null);
      alert("Couldn't queue an update — please try again.");
      return;
    }
    const start = Date.now();
    const poll = async () => {
      if (Date.now() - start > 7 * 60 * 1000) {
        setRefreshing(false);
        setNote("Still waiting — your scraper runs on its own schedule; this page fills in once it does.");
        return;
      }
      try {
        const fresh: Comp[] = (await (await fetch("/api/competitors")).json()).competitors || [];
        setList(fresh);
        const newest = Math.max(
          0,
          ...fresh.map((c) => (c.lastSyncedAt ? new Date(c.lastSyncedAt).getTime() : 0))
        );
        if (newest > baseline) {
          setRefreshing(false);
          setNote("Updated ✓");
          setTimeout(() => setNote(null), 5000);
          return;
        }
      } catch {
        /* keep polling */
      }
      setTimeout(poll, 25000);
    };
    setTimeout(poll, 25000);
  }

  const toggleNiche = (n: string) =>
    setPicked((p) => (p.includes(n) ? p.filter((x) => x !== n) : [...p, n]));

  const nichesInUse = Array.from(new Set(list.flatMap((c) => c.niche || []))).sort();
  const shown = filter === "all" ? list : list.filter((c) => (c.niche || []).includes(filter));

  return (
    <DashboardLayout>
    <div className="max-w-4xl mx-auto">
      <button
        onClick={() => router.back()}
        className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-[#f5e6c8] mb-4 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      <div className="flex items-start justify-between gap-3">
        <h1 className="text-2xl font-semibold" style={{ color: "#f5e6c8" }}>
          Competitors
        </h1>
        <button
          onClick={update}
          disabled={refreshing || list.length === 0}
          title="Scrape your tracked accounts now (competitors included)"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium flex-shrink-0 border border-white/10 bg-white/5 text-[#f5e6c8] hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
          {refreshing ? "Updating…" : "Update"}
        </button>
      </div>
      <p className="text-sm text-gray-400 mt-1 mb-5">
        Track creators you want to learn from — drop an Instagram link or handle, tag the niche, and
        they get scraped alongside your accounts so you can study their winners.
      </p>
      {note && <p className="text-xs text-amber-400/80 mb-4">{note}</p>}

      {/* Add form */}
      <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4 mb-6">
        <div className="flex gap-2">
          <input
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder="instagram.com/creator  or  @creator"
            className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-[#d4a853]/50"
          />
          <button
            onClick={add}
            disabled={adding || !handle.trim()}
            className="px-4 py-2 rounded-lg text-sm font-medium flex-shrink-0 bg-[#d4a853] text-black hover:bg-[#e0b863] disabled:opacity-60"
          >
            {adding ? "Adding…" : "+ Track"}
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 mt-3">
          <span className="text-xs text-gray-500 mr-1">Niche:</span>
          {NICHES.map((n) => {
            const active = picked.includes(n);
            const col = nicheColor(n);
            return (
              <button
                key={n}
                onClick={() => toggleNiche(n)}
                className="text-xs px-2.5 py-1 rounded-full border transition-colors"
                style={
                  active
                    ? { backgroundColor: col, color: "#000", borderColor: col }
                    : { backgroundColor: "transparent", color: "#9ca3af", borderColor: "rgba(255,255,255,0.12)" }
                }
              >
                {n}
              </button>
            );
          })}
        </div>
      </div>

      {/* Niche filter (only when some competitors are tagged) */}
      {nichesInUse.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {[["all", `All (${list.length})`] as const, ...nichesInUse.map((n) => [n, n] as const)].map(
            ([key, label]) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`text-xs px-3 py-1 rounded-full transition-colors ${
                  filter === key ? "bg-[#d4a853]/20 text-[#d4a853]" : "text-gray-400 hover:bg-white/5"
                }`}
              >
                {label}
              </button>
            )
          )}
        </div>
      )}

      {loading ? (
        <p className="text-gray-500">Loading…</p>
      ) : list.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/10 p-10 text-center">
          <p className="text-gray-400">No competitors tracked yet.</p>
          <p className="text-xs text-gray-600 mt-1">
            Paste an Instagram link or handle above, pick a niche, and hit Track.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {shown.map((c) => {
            const name = c.igUsername || c.username;
            const avatarColor = c.niche?.[0] ? nicheColor(c.niche[0]) : "#d4a853";
            return (
              <div
                key={c.id}
                className="group relative rounded-xl border border-white/5 bg-white/[0.02] p-4 hover:border-white/10 transition-colors"
              >
                <button
                  onClick={() => remove(c.id)}
                  title="Remove"
                  className="absolute top-3 right-3 text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
                <div className="flex items-center gap-3">
                  <div
                    className="w-11 h-11 rounded-full flex items-center justify-center text-base font-bold text-black flex-shrink-0"
                    style={{ backgroundColor: avatarColor }}
                  >
                    {(name || "?")[0].toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <a
                      href={`https://instagram.com/${name}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm font-semibold hover:underline inline-flex items-center gap-1 max-w-full"
                      style={{ color: "#f5e6c8" }}
                    >
                      <span className="truncate">@{name}</span>
                      <ExternalLink className="h-3 w-3 flex-shrink-0 opacity-60" />
                    </a>
                    <div className="text-[11px] text-gray-500 mt-0.5">
                      {c.lastSyncedAt
                        ? `${c.followers.toLocaleString()} followers · ${c._count.reels} reels`
                        : "not scraped yet"}
                    </div>
                  </div>
                </div>
                {c.niche?.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-3">
                    {c.niche.map((n) => {
                      const col = nicheColor(n);
                      return (
                        <span
                          key={n}
                          className="text-[10px] px-1.5 py-0.5 rounded"
                          style={{ backgroundColor: `${col}22`, color: col, border: `1px solid ${col}40` }}
                        >
                          {n}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
    </DashboardLayout>
  );
}
