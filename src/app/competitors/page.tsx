"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

type Comp = {
  id: string;
  username: string;
  igUsername: string | null;
  followers: number;
  lastSyncedAt: string | null;
  _count: { reels: number };
};

export default function CompetitorsPage() {
  const router = useRouter();
  const [list, setList] = useState<Comp[]>([]);
  const [handle, setHandle] = useState("");
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
        body: JSON.stringify({ igUsername: handle }),
      });
      if (res.ok) {
        setHandle("");
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

  return (
    <div className="p-8 max-w-3xl mx-auto">
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
          className="px-3 py-1.5 rounded-lg text-sm font-medium flex-shrink-0 border border-white/10 bg-white/5 text-[#f5e6c8] hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {refreshing ? "Updating…" : "↻ Update"}
        </button>
      </div>
      <p className="text-sm text-gray-400 mt-1 mb-2">
        Track other creators&apos; Instagram accounts — they get scraped daily and feed the idea engine,
        so you learn from their winners too.
      </p>
      {note && <p className="text-xs text-amber-400/80 mb-3">{note}</p>}

      <div className="flex gap-2 mb-6">
        <input
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="instagram username (e.g. @creator)"
          className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-500"
        />
        <button
          onClick={add}
          disabled={adding}
          className="px-4 py-2 rounded-lg text-sm font-medium bg-[#d4a853] text-black hover:bg-[#e0b863] disabled:opacity-60"
        >
          {adding ? "Adding…" : "+ Track"}
        </button>
      </div>

      {loading ? (
        <p className="text-gray-500">Loading…</p>
      ) : list.length === 0 ? (
        <p className="text-gray-500">No competitors tracked yet — add an Instagram handle above.</p>
      ) : (
        <div className="space-y-2">
          {list.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between p-3 rounded-xl border border-white/5 bg-white/[0.02]"
            >
              <div>
                <a
                  href={`https://instagram.com/${c.igUsername || c.username}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm font-medium hover:underline"
                  style={{ color: "#f5e6c8" }}
                >
                  @{c.igUsername || c.username}
                </a>
                <div className="text-xs text-gray-400 mt-0.5">
                  {c.followers.toLocaleString()} followers · {c._count.reels} reels tracked ·{" "}
                  {c.lastSyncedAt ? "synced" : "not scraped yet"}
                </div>
              </div>
              <button onClick={() => remove(c.id)} className="text-gray-600 hover:text-red-400 text-sm">
                🗑️
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
