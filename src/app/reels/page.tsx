"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import DashboardLayout from "@/components/layout/dashboard-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { formatNumber } from "@/lib/utils";
import {
  Eye, Heart, Film, TrendingUp, TrendingDown, Users,
  ExternalLink, RefreshCw, Clock, MessageCircle,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from "recharts";

const NICHE_COLORS: Record<string, string> = {
  Golf: "#22c55e", Talking: "#3b82f6", Omegle: "#a855f7",
  Podcast: "#f59e0b", Dancing: "#ec4899", "Motion Control": "#14b8a6",
};

export default function ReelsPage() {
  const router = useRouter();
  const [reels, setReels] = useState<any[]>([]);
  const [analytics, setAnalytics] = useState<any>(null);
  const [posted24h, setPosted24h] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedAccount, setSelectedAccount] = useState("all");
  const [sortBy, setSortBy] = useState("currentViews");
  const [days, setDays] = useState("7");
  const [postedWithin, setPostedWithin] = useState("all"); // all | 24h | 7d (when a reel was posted)

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const reelParams = new URLSearchParams({ sortBy, sortOrder: "desc" });
      if (selectedAccount !== "all") reelParams.set("accountId", selectedAccount);
      if (postedWithin !== "all") reelParams.set("postedWithin", postedWithin);

      const analyticsParams = new URLSearchParams({ days });
      if (selectedAccount !== "all") analyticsParams.set("accountId", selectedAccount);

      const [reelsRes, analyticsRes] = await Promise.all([
        fetch(`/api/reels?${reelParams}`),
        fetch(`/api/analytics?${analyticsParams}`),
      ]);

      const reelsData = await reelsRes.json();
      const analyticsData = await analyticsRes.json();

      setReels(reelsData.reels || []);
      setPosted24h(reelsData.posted24h || null);
      setAnalytics(analyticsData);
    } catch (error) {
      console.error("Failed to fetch reels:", error);
    } finally {
      setLoading(false);
    }
  }, [selectedAccount, sortBy, days, postedWithin]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const accounts = analytics?.accounts || [];
  const totalViews = accounts.reduce((s: number, a: any) => s + (a.totalViews || 0), 0);
  const totalLikes = accounts.reduce((s: number, a: any) => s + (a.totalLikes || 0), 0);
  const totalFollowers = accounts.reduce((s: number, a: any) => s + (a.currentFollowers || 0), 0);
  const totalNewFollowers = accounts.reduce((s: number, a: any) => s + (a.newFollowersToday || 0), 0);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Reels Analytics</h1>
            <p className="text-sm text-gray-500 mt-1">
              Live Instagram performance tracking across all accounts
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Select value={selectedAccount} onValueChange={setSelectedAccount}>
              <SelectTrigger className="w-[180px] bg-white">
                <SelectValue placeholder="All Accounts" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Accounts</SelectItem>
                {accounts.map((a: any) => (
                  <SelectItem key={a.id} value={a.id}>@{a.igUsername}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex bg-white rounded-lg border border-gray-200 p-1">
              {[{ v: "7", l: "7D" }, { v: "14", l: "14D" }, { v: "30", l: "30D" }].map((p) => (
                <button key={p.v} onClick={() => setDays(p.v)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                    days === p.v ? "bg-[#0a0a0a] text-[#f5e6c8]" : "text-gray-500 hover:text-gray-700"
                  }`}>{p.l}</button>
              ))}
            </div>
            <Button variant="outline" size="sm" onClick={fetchData} className="gap-2">
              <RefreshCw className="h-4 w-4" /> Refresh
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {[
            { title: "Total Views", value: totalViews, icon: Eye, color: "#d4a853" },
            { title: "Total Likes", value: totalLikes, icon: Heart, color: "#ef4444" },
            { title: "Total Followers", value: totalFollowers, icon: Users, color: "#06b6d4" },
            { title: "New Followers Today", value: totalNewFollowers, icon: TrendingUp, color: "#22c55e" },
            { title: "Total Reels", value: reels.length, icon: Film, color: "#a855f7" },
          ].map((s) => (
            <Card key={s.title} className="animate-fade-in">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">{s.title}</p>
                    <p className="text-2xl font-bold mt-1" style={{ color: s.color }}>
                      {formatNumber(s.value)}
                    </p>
                  </div>
                  <div className="p-2.5 rounded-xl" style={{ backgroundColor: `${s.color}10` }}>
                    <s.icon className="h-5 w-5" style={{ color: s.color }} />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Per-Account Cards */}
        {accounts.length > 0 && selectedAccount === "all" && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {accounts.map((acc: any) => (
              <Card key={acc.id} className="animate-fade-in hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => router.push(`/reels/${acc.id}`)}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white"
                        style={{ backgroundColor: NICHE_COLORS[acc.niche?.[0]] || "#6b7280" }}>
                        {(acc.igUsername || "?")[0].toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-900">@{acc.igUsername}</p>
                        <p className="text-[10px] text-gray-400">{(acc.niche || []).join(", ")}</p>
                      </div>
                    </div>
                    <a href={`https://instagram.com/${acc.igUsername}`} target="_blank" rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-gray-300 hover:text-[#d4a853] transition-colors">
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <p className="text-lg font-bold text-gray-900">{formatNumber(acc.currentFollowers)}</p>
                      <p className="text-[10px] text-gray-400">Followers</p>
                      {acc.newFollowersToday !== 0 && (
                        <p className={`text-[10px] font-medium ${acc.newFollowersToday > 0 ? "text-emerald-500" : "text-red-500"}`}>
                          {acc.newFollowersToday > 0 ? "+" : ""}{acc.newFollowersToday}
                        </p>
                      )}
                    </div>
                    <div>
                      <p className="text-lg font-bold text-gray-900">{formatNumber(acc.totalViews)}</p>
                      <p className="text-[10px] text-gray-400">Views</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold text-gray-900">{formatNumber(acc.totalReels)}</p>
                      <p className="text-[10px] text-gray-400">Reels</p>
                    </div>
                  </div>
                  {acc.lastSyncedAt && (
                    <div className="flex items-center gap-1 mt-3 text-[10px] text-gray-400">
                      <Clock className="h-3 w-3" />
                      Last sync: {new Date(acc.lastSyncedAt).toLocaleString("sr-RS", { timeZone: "Europe/Belgrade" })}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Charts */}
        {analytics?.viewGrowth?.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="animate-fade-in">
              <CardHeader><CardTitle className="text-base">Daily New Views</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={analytics.viewGrowth}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} tickFormatter={(v) => formatNumber(v)} />
                    <Tooltip contentStyle={{ borderRadius: "8px", border: "1px solid #e5e7eb" }}
                      formatter={(v: any) => [formatNumber(Number(v)), ""]} />
                    <Bar dataKey="newViews" fill="#d4a853" radius={[4, 4, 0, 0]} name="New Views" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card className="animate-fade-in">
              <CardHeader><CardTitle className="text-base">Daily New Likes</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={analytics.viewGrowth}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} tickFormatter={(v) => formatNumber(v)} />
                    <Tooltip contentStyle={{ borderRadius: "8px", border: "1px solid #e5e7eb" }}
                      formatter={(v: any) => [formatNumber(Number(v)), ""]} />
                    <Bar dataKey="newLikes" fill="#ef4444" radius={[4, 4, 0, 0]} name="New Likes" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        )}

        {analytics?.followerGrowth?.length > 0 && (
          <Card className="animate-fade-in">
            <CardHeader><CardTitle className="text-base">Follower Growth</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={analytics.followerGrowth}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} tickFormatter={(v) => formatNumber(v)} />
                  <Tooltip contentStyle={{ borderRadius: "8px", border: "1px solid #e5e7eb" }}
                    formatter={(v: any) => [formatNumber(Number(v)), ""]} />
                  <Legend />
                  <Line type="monotone" dataKey="totalFollowers" stroke="#d4a853" strokeWidth={2.5} dot={false} name="Total Followers" />
                  <Line type="monotone" dataKey="totalNew" stroke="#22c55e" strokeWidth={2} dot={false} name="New (daily)" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Last 24h summary — performance of reels posted today */}
        {posted24h && (
          <Card className="animate-fade-in border-[#d4a853]/40 bg-[#d4a853]/5">
            <CardContent className="p-4">
              <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
                <div className="flex items-center gap-2.5 mr-2">
                  <div className="p-2 rounded-lg bg-[#d4a853]/15">
                    <Clock className="h-4 w-4 text-[#b8860b]" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-800 leading-tight">Last 24 hours</p>
                    <p className="text-[11px] text-gray-500">
                      Reels posted today{selectedAccount === "all" ? " · all accounts" : ""}
                    </p>
                  </div>
                </div>
                {[
                  { label: "Posted", value: posted24h.count, icon: Film, color: "#a855f7" },
                  { label: "Views", value: posted24h.views, icon: Eye, color: "#d4a853" },
                  { label: "Likes", value: posted24h.likes, icon: Heart, color: "#ef4444" },
                  { label: "Comments", value: posted24h.comments, icon: MessageCircle, color: "#3b82f6" },
                ].map((m) => (
                  <div key={m.label} className="flex items-center gap-2">
                    <m.icon className="h-4 w-4 flex-shrink-0" style={{ color: m.color }} />
                    <div>
                      <p className="text-lg font-bold text-gray-900 leading-none">{formatNumber(m.value)}</p>
                      <p className="text-[10px] text-gray-400 uppercase tracking-wide mt-0.5">{m.label}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Reels Table */}
        <Card className="animate-fade-in">
          <CardHeader>
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base">
                  {postedWithin === "24h"
                    ? "Posted in the last 24 hours"
                    : postedWithin === "7d"
                    ? "Posted in the last 7 days"
                    : "All Reels"}
                </CardTitle>
                {!loading && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    {reels.length} reel{reels.length !== 1 ? "s" : ""}
                    {selectedAccount === "all" ? " across all accounts" : ""}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-400 hidden sm:inline">Posted:</span>
                <div className="flex bg-white rounded-lg border border-gray-200 p-1">
                  {[{ v: "all", l: "All" }, { v: "24h", l: "24h" }, { v: "7d", l: "7d" }].map((p) => (
                    <button
                      key={p.v}
                      onClick={() => setPostedWithin(p.v)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                        postedWithin === p.v ? "bg-[#0a0a0a] text-[#f5e6c8]" : "text-gray-500 hover:text-gray-700"
                      }`}
                    >
                      {p.l}
                    </button>
                  ))}
                </div>
                <Select value={sortBy} onValueChange={setSortBy}>
                  <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="currentViews">Most Views</SelectItem>
                    <SelectItem value="currentLikes">Most Likes</SelectItem>
                    <SelectItem value="publishedAt">Recently Posted</SelectItem>
                    <SelectItem value="lastScrapedAt">Recently Updated</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-8 text-center text-gray-400">Loading reels...</div>
            ) : reels.length === 0 ? (
              <div className="p-8 text-center text-gray-400">
                {postedWithin === "24h"
                  ? "No reels posted in the last 24 hours."
                  : postedWithin === "7d"
                  ? "No reels posted in the last 7 days."
                  : "No reels found. Run the scraper to start tracking."}
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {reels.map((reel: any) => (
                  <div key={reel.id} className="flex items-center gap-4 p-4 hover:bg-gray-50/50 transition-colors">
                    {/* Thumbnail */}
                    <div className="w-16 h-16 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
                      {reel.thumbnailUrl ? (
                        <img src={`/api/img-proxy?url=${encodeURIComponent(reel.thumbnailUrl)}`} alt="" className="w-full h-full object-cover"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Film className="h-6 w-6 text-gray-300" />
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <a href={reel.reelUrl} target="_blank" rel="noopener noreferrer"
                          className="text-sm font-medium text-gray-900 hover:text-[#d4a853] transition-colors flex items-center gap-1">
                          {reel.shortcode}
                          <ExternalLink className="h-3 w-3 opacity-50" />
                        </a>
                        {reel.account && (
                          <Badge variant="secondary" className="text-[10px]">
                            @{reel.account.igUsername}
                          </Badge>
                        )}
                      </div>
                      {reel.publishedAt && (
                        <p className="text-[11px] text-gray-500 mt-0.5">
                          Posted {formatDistanceToNow(new Date(reel.publishedAt), { addSuffix: true })}
                        </p>
                      )}
                      {reel.caption && (
                        <p className="text-xs text-gray-400 mt-0.5 truncate max-w-md">{reel.caption}</p>
                      )}
                    </div>

                    {/* Stats */}
                    <div className="flex items-center gap-6 flex-shrink-0">
                      <div className="text-right">
                        <div className="flex items-center gap-1.5">
                          <Eye className="h-3.5 w-3.5 text-gray-400" />
                          <span className="text-sm font-semibold text-gray-900">
                            {formatNumber(reel.currentViews)}
                          </span>
                        </div>
                        {reel.viewsDelta !== 0 && (
                          <span className={`text-[10px] font-medium ${reel.viewsDelta > 0 ? "text-emerald-500" : "text-red-500"}`}>
                            {reel.viewsDelta > 0 ? "+" : ""}{formatNumber(reel.viewsDelta)}
                          </span>
                        )}
                      </div>
                      <div className="text-right">
                        <div className="flex items-center gap-1.5">
                          <Heart className="h-3.5 w-3.5 text-gray-400" />
                          <span className="text-sm font-semibold text-gray-900">
                            {formatNumber(reel.currentLikes)}
                          </span>
                        </div>
                        {reel.likesDelta !== 0 && (
                          <span className={`text-[10px] font-medium ${reel.likesDelta > 0 ? "text-emerald-500" : "text-red-500"}`}>
                            {reel.likesDelta > 0 ? "+" : ""}{formatNumber(reel.likesDelta)}
                          </span>
                        )}
                      </div>
                      <div className="text-right">
                        <div className="flex items-center gap-1.5">
                          <MessageCircle className="h-3.5 w-3.5 text-gray-400" />
                          <span className="text-sm font-semibold text-gray-900">
                            {formatNumber(reel.currentComments)}
                          </span>
                        </div>
                        {reel.commentsDelta !== 0 && (
                          <span className={`text-[10px] font-medium ${reel.commentsDelta > 0 ? "text-emerald-500" : "text-red-500"}`}>
                            {reel.commentsDelta > 0 ? "+" : ""}{formatNumber(reel.commentsDelta)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
