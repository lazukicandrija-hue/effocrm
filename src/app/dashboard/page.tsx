"use client";

import { useEffect, useState, useCallback } from "react";
import DashboardLayout from "@/components/layout/dashboard-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { formatNumber, calcDelta } from "@/lib/utils";
import {
  Camera,
  Eye,
  TrendingUp,
  TrendingDown,
  Users,
  Plus,
  Ban,
  Activity,
  Clock,
  Film,
  Play,
  ExternalLink,
  RefreshCw,
} from "lucide-react";

interface DashboardStats {
  totalAccounts: number;
  activeAccounts: number;
  warningAccounts: number;
  pausedAccounts: number;
  bannedAccounts: number;
  viewsToday: number;
  viewsYesterday: number;
  viewsDelta: number;
  viewsThisWeek: number;
  viewsThisMonth: number;
  followersToday: number;
  followersDelta: number;
  accountsAddedToday: number;
  views24h: number;
  views24hFromNewReels: number;
  newReels24hCount: number;
  lastSyncedAt: string | null;
  viewsByNiche: any[];
  viewsOverTime: any[];
  statusDistribution: any[];
}

const FIXED_NICHES = ["Golf", "Talking", "Omegle", "Podcast", "Dancing", "Motion Control"];

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState("today");
  const [modelId, setModelId] = useState("all");
  const [models, setModels] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  // Latest-reels feed (Instagram-style grid of newly-scraped reels)
  const [reels, setReels] = useState<any[]>([]);
  const [reelsLoading, setReelsLoading] = useState(true);
  const [reelWindow, setReelWindow] = useState("7d"); // 24h | 7d | 30d
  const [reelAccountId, setReelAccountId] = useState("all"); // filter feed to one account
  const [reelNiche, setReelNiche] = useState("all"); // filter feed by niche
  const [reelSort, setReelSort] = useState("publishedAt"); // publishedAt | currentViews | currentLikes
  const [accountsList, setAccountsList] = useState<any[]>([]); // options for the picker

  const fetchStats = useCallback(async () => {
    try {
      const params = new URLSearchParams({ period, modelId });
      const res = await fetch(`/api/stats?${params}`);
      const data = await res.json();
      setStats(data);
    } catch (error) {
      console.error("Failed to fetch stats:", error);
    } finally {
      setLoading(false);
    }
  }, [period, modelId]);

  // "Refresh now": ask the VPS scraper for an immediate run, then poll until the
  // fresh data lands (lastSyncedAt advances) and update the numbers in place.
  const handleRefreshNow = async () => {
    if (refreshing) return;
    const baseline = stats?.lastSyncedAt
      ? new Date(stats.lastSyncedAt).getTime()
      : 0;
    setRefreshing(true);
    try {
      const res = await fetch("/api/scraper/request-refresh", { method: "POST" });
      if (!res.ok) throw new Error();
    } catch {
      alert("Couldn't queue a refresh — please try again.");
      setRefreshing(false);
      return;
    }
    const start = Date.now();
    const poll = async () => {
      if (Date.now() - start > 7 * 60 * 1000) {
        setRefreshing(false); // timed out — the scrape may still land shortly
        return;
      }
      try {
        const params = new URLSearchParams({ period, modelId });
        const r = await fetch(`/api/stats?${params}`);
        const d = await r.json();
        setStats(d);
        const ls = d.lastSyncedAt ? new Date(d.lastSyncedAt).getTime() : 0;
        if (ls > baseline) {
          fetchReels(); // fresh scrape landed — refresh the reels feed too
          setRefreshing(false);
          return;
        }
      } catch {
        /* keep polling */
      }
      setTimeout(poll, 25000);
    };
    setTimeout(poll, 25000);
  };

  const fetchModels = useCallback(async () => {
    try {
      const res = await fetch("/api/models");
      const data = await res.json();
      setModels(data);
    } catch (error) {
      console.error("Failed to fetch models:", error);
    }
  }, []);

  // Pull the newest reels across every (owned) account for the feed. Respects the
  // model filter and the selected time window; newest-posted first.
  const fetchReels = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        sortBy: reelSort,
        sortOrder: "desc",
        modelId,
        postedWithin: reelWindow,
      });
      if (reelAccountId !== "all") params.set("accountId", reelAccountId);
      if (reelNiche !== "all") params.set("niche", reelNiche);
      const res = await fetch(`/api/reels?${params}`);
      const data = await res.json();
      setReels(Array.isArray(data.reels) ? data.reels : []);
    } catch (error) {
      console.error("Failed to fetch reels:", error);
    } finally {
      setReelsLoading(false);
    }
  }, [modelId, reelWindow, reelAccountId, reelNiche, reelSort]);

  // Account options for the reels-feed picker (lightweight; owned accounts only).
  const fetchAccountsList = useCallback(async () => {
    try {
      const res = await fetch("/api/accounts/options");
      const data = await res.json();
      setAccountsList(Array.isArray(data.accounts) ? data.accounts : []);
    } catch (error) {
      console.error("Failed to fetch account options:", error);
    }
  }, []);

  useEffect(() => {
    fetchModels();
    fetchAccountsList();
  }, [fetchModels, fetchAccountsList]);

  useEffect(() => {
    setLoading(true);
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    setReelsLoading(true);
    fetchReels();
  }, [fetchReels]);

  const StatCard = ({
    title,
    value,
    delta,
    icon: Icon,
    color,
    delay,
  }: {
    title: string;
    value: number | string;
    delta?: number;
    icon: any;
    color: string;
    delay: string;
  }) => (
    <Card className={`animate-fade-in ${delay}`}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
              {title}
            </p>
            <p className="text-2xl font-bold mt-1" style={{ color }}>
              {typeof value === "number" ? formatNumber(value) : value}
            </p>
            {delta !== undefined && (
              <div className="flex items-center gap-1 mt-1">
                {delta >= 0 ? (
                  <TrendingUp className="h-3 w-3 text-emerald-500" />
                ) : (
                  <TrendingDown className="h-3 w-3 text-red-500" />
                )}
                <span
                  className={`text-xs font-medium ${
                    delta >= 0 ? "text-emerald-500" : "text-red-500"
                  }`}
                >
                  {delta >= 0 ? "+" : ""}
                  {formatNumber(delta)} vs yesterday
                </span>
              </div>
            )}
          </div>
          <div
            className="p-2.5 rounded-xl"
            style={{ backgroundColor: `${color}10` }}
          >
            <Icon className="h-5 w-5" style={{ color }} />
          </div>
        </div>
      </CardContent>
    </Card>
  );

  // Accounts shown in the feed picker — scoped to the selected model.
  const accountOptions = accountsList.filter(
    (a) => modelId === "all" || a.modelId === modelId
  );
  // Niche options — the standard set plus any custom niches on the shown accounts.
  const nicheOptions = Array.from(
    new Set([
      ...FIXED_NICHES,
      ...accountOptions.flatMap((a: any) => (Array.isArray(a.niche) ? a.niche : [])),
    ])
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
            <p className="text-sm text-gray-500 mt-1">
              Overview of your Instagram accounts performance
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Period filter */}
            <div className="flex bg-white rounded-lg border border-gray-200 p-1">
              {["today", "week", "month"].map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                    period === p
                      ? "bg-[#0a0a0a] text-[#f5e6c8]"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {p === "today" ? "Today" : p === "week" ? "This Week" : "This Month"}
                </button>
              ))}
            </div>

            {/* Model filter */}
            <Select
              value={modelId}
              onValueChange={(v) => {
                setModelId(v);
                setReelAccountId("all"); // avoid a stale account from another model
                setReelNiche("all");
              }}
            >
              <SelectTrigger className="w-[160px] bg-white">
                <SelectValue placeholder="All Models" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Models</SelectItem>
                {models.map((model: any) => (
                  <SelectItem key={model.id} value={model.id}>
                    {model.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Refresh now — triggers a scrape on the VPS */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefreshNow}
              disabled={refreshing}
              className="gap-2 h-9 bg-white"
              title="Trigger an immediate scrape on the VPS — numbers update in ~3–4 min"
            >
              <RefreshCw
                className={"h-4 w-4 " + (refreshing ? "animate-spin" : "")}
              />
              {refreshing ? "Refreshing…" : "Refresh now"}
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-4">
            {[...Array(7)].map((_, i) => (
              <Card key={i}>
                <CardContent className="p-5">
                  <div className="animate-pulse space-y-3">
                    <div className="h-3 bg-gray-200 rounded w-2/3" />
                    <div className="h-7 bg-gray-200 rounded w-1/2" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : stats ? (
          <>
            {/* Stats cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-4">
              <StatCard
                title="Active Accounts"
                value={stats.activeAccounts}
                icon={Camera}
                color="#22c55e"
                delay=""
              />
              <StatCard
                title="Views Today"
                value={stats.viewsToday}
                delta={stats.viewsDelta}
                icon={Eye}
                color="#d4a853"
                delay="animate-delay-100"
              />
              <StatCard
                title="Views This Week"
                value={stats.viewsThisWeek}
                icon={Activity}
                color="#3b82f6"
                delay="animate-delay-200"
              />
              <StatCard
                title="Views This Month"
                value={stats.viewsThisMonth}
                icon={TrendingUp}
                color="#a855f7"
                delay="animate-delay-300"
              />
              <StatCard
                title="Followers Today"
                value={stats.followersToday}
                delta={stats.followersDelta}
                icon={Users}
                color="#06b6d4"
                delay="animate-delay-400"
              />
              <StatCard
                title="Added Today"
                value={stats.accountsAddedToday}
                icon={Plus}
                color="#d4a853"
                delay="animate-delay-500"
              />
              <StatCard
                title="Banned"
                value={stats.bannedAccounts}
                icon={Ban}
                color="#ef4444"
                delay="animate-delay-600"
              />
            </div>

            {/* Last 24 hours (rolling) */}
            <Card className="animate-fade-in border-[#d4a853]/40 bg-[#d4a853]/5">
              <CardContent className="p-4">
                <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
                  <div className="flex items-center gap-2.5 mr-2">
                    <div className="p-2 rounded-lg bg-[#d4a853]/15">
                      <Clock className="h-4 w-4 text-[#b8860b]" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-800 leading-tight">
                        Last 24 hours
                      </p>
                      <p className="text-[11px] text-gray-500">
                        Rolling — Instagram reel views
                      </p>
                    </div>
                  </div>
                  {[
                    { label: "Reel views", value: stats.views24h, icon: Eye, color: "#d4a853" },
                    { label: "Reels posted", value: stats.newReels24hCount, icon: Film, color: "#a855f7" },
                    { label: "Views on those", value: stats.views24hFromNewReels, icon: TrendingUp, color: "#22c55e" },
                  ].map((m) => (
                    <div key={m.label} className="flex items-center gap-2">
                      <m.icon className="h-4 w-4 flex-shrink-0" style={{ color: m.color }} />
                      <div>
                        <p className="text-lg font-bold text-gray-900 leading-none">
                          {formatNumber(m.value)}
                        </p>
                        <p className="text-[10px] text-gray-400 uppercase tracking-wide mt-0.5">
                          {m.label}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Status Balance Bar */}
            <Card className="animate-fade-in">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-gray-500 uppercase tracking-wider">
                  Account Status Balance
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex rounded-full overflow-hidden h-4 bg-gray-100">
                  {stats.statusDistribution.map((status: any) =>
                    status.value > 0 ? (
                      <div
                        key={status.name}
                        className="h-full transition-all duration-500 ease-out"
                        style={{
                          width: `${(status.value / stats.totalAccounts) * 100}%`,
                          backgroundColor: status.color,
                        }}
                        title={`${status.name}: ${status.value}`}
                      />
                    ) : null
                  )}
                </div>
                <div className="flex gap-6 mt-3">
                  {stats.statusDistribution.map((status: any) => (
                    <div key={status.name} className="flex items-center gap-2">
                      <div
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: status.color }}
                      />
                      <span className="text-xs text-gray-600">
                        {status.name}: {status.value}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Latest Reels — an Instagram-style feed of the newest reels the
                scraper picked up from every account in the Accounts tab. Click a
                tile to open the reel on Instagram. Updates on "Refresh now". */}
            <Card className="animate-fade-in">
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Film className="h-4 w-4 text-[#d4a853]" />
                      Latest Reels
                    </CardTitle>
                    <p className="text-xs text-gray-500 mt-1">
                      Newest reels from every account — click a thumbnail to open it on Instagram
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Account picker — filter the feed to a single account */}
                    <Select value={reelAccountId} onValueChange={setReelAccountId}>
                      <SelectTrigger className="w-[180px] h-9 bg-white">
                        <SelectValue placeholder="All accounts" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All accounts</SelectItem>
                        {accountOptions.map((a: any) => (
                          <SelectItem key={a.id} value={a.id}>
                            @{a.igUsername || a.username}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {/* Niche picker — filter the feed by the account's niche */}
                    <Select value={reelNiche} onValueChange={setReelNiche}>
                      <SelectTrigger className="w-[150px] h-9 bg-white">
                        <SelectValue placeholder="All niches" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All niches</SelectItem>
                        {nicheOptions.map((n: string) => (
                          <SelectItem key={n} value={n}>
                            {n}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {/* Sort */}
                    <Select value={reelSort} onValueChange={setReelSort}>
                      <SelectTrigger className="w-[140px] h-9 bg-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="publishedAt">Newest</SelectItem>
                        <SelectItem value="currentViews">Most views</SelectItem>
                        <SelectItem value="currentLikes">Most likes</SelectItem>
                      </SelectContent>
                    </Select>
                    {/* Time-window toggle */}
                    <div className="flex bg-white rounded-lg border border-gray-200 p-1">
                      {[
                        { k: "24h", label: "24h" },
                        { k: "7d", label: "7 days" },
                        { k: "30d", label: "30 days" },
                        { k: "all", label: "All" },
                      ].map((w) => (
                        <button
                          key={w.k}
                          onClick={() => setReelWindow(w.k)}
                          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                            reelWindow === w.k
                              ? "bg-[#0a0a0a] text-[#f5e6c8]"
                              : "text-gray-500 hover:text-gray-700"
                          }`}
                        >
                          {w.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {reelsLoading ? (
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-6 gap-3">
                    {[...Array(12)].map((_, i) => (
                      <div
                        key={i}
                        className="aspect-[9/16] rounded-lg bg-gray-100 animate-pulse"
                      />
                    ))}
                  </div>
                ) : reels.length === 0 ? (
                  <div className="py-12 text-center text-gray-500">
                    <Film className="h-10 w-10 mx-auto mb-3 text-gray-300" />
                    <p className="text-sm">No reels posted in this window.</p>
                    <p className="text-xs text-gray-400 mt-1">
                      Try a wider range, or press{" "}
                      <span className="font-medium">Refresh now</span> to pull the latest.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-6 gap-3">
                      {reels.slice(0, 60).map((r: any) => {
                        const handle =
                          r.account?.igUsername || r.account?.username || "account";
                        return (
                          <a
                            key={r.id}
                            href={r.reelUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={`@${handle} — ${formatNumber(r.currentViews)} views · open on Instagram`}
                            className="group relative block aspect-[9/16] rounded-lg overflow-hidden bg-gray-900"
                          >
                            {/* Fallback icon — shows through until a cached image exists */}
                            <div className="absolute inset-0 flex items-center justify-center text-gray-600">
                              <Film className="h-7 w-7" />
                            </div>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={`/api/thumb/${r.id}`}
                              alt=""
                              loading="lazy"
                              className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                            />
                            {/* Stats overlay — high-contrast so it reads over any thumbnail */}
                            <div className="absolute inset-x-0 bottom-0 p-2 pt-7 bg-gradient-to-t from-black/90 via-black/50 to-transparent">
                              <div className="flex items-center gap-1 text-[#ffd84d] text-sm font-bold leading-none [text-shadow:0_1px_3px_rgb(0_0_0_/_90%)]">
                                <Play className="h-3.5 w-3.5 fill-[#ffd84d]" />
                                {formatNumber(r.currentViews)}
                              </div>
                              <div className="mt-1 text-[11px] font-semibold text-white truncate [text-shadow:0_1px_3px_rgb(0_0_0_/_90%)]">
                                @{handle}
                              </div>
                            </div>
                            {/* Open-on-Instagram affordance */}
                            <div className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                              <div className="p-1 rounded-md bg-black/50 text-white">
                                <ExternalLink className="h-3 w-3" />
                              </div>
                            </div>
                          </a>
                        );
                      })}
                    </div>
                    {reels.length > 60 && (
                      <p className="text-center text-xs text-gray-400 mt-4">
                        Showing 60 of {reels.length} reels — narrow the filters to see the rest.
                      </p>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </>
        ) : (
          <div className="text-center py-12 text-gray-500">
            No data available. Add some accounts to get started.
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
