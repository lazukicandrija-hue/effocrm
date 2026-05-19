"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import DashboardLayout from "@/components/layout/dashboard-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { formatNumber } from "@/lib/utils";
import {
  Eye, Heart, Film, Users, ExternalLink, RefreshCw, Clock,
  ArrowLeft, TrendingUp, Grid3x3, List, Play,
} from "lucide-react";
import { Button } from "@/components/ui/button";

type Reel = {
  id: string;
  shortcode: string;
  thumbnailUrl: string | null;
  caption: string | null;
  currentViews: number;
  currentLikes: number;
  currentComments: number;
  viewsDelta: number;
  likesDelta: number;
  lastScrapedAt: string | null;
  reelUrl: string;
  account: { id: string; igUsername: string; niche: string } | null;
};

type AccountInfo = {
  id: string;
  username: string;
  igUsername: string;
  niche: string;
  currentFollowers: number;
  newFollowersToday: number;
  totalReels: number;
  totalViews: number;
  totalLikes: number;
  lastSyncedAt: string | null;
};

const NICHE_COLORS: Record<string, string> = {
  GOLF: "#22c55e", CASUAL: "#3b82f6", TALKING_HEAD: "#a855f7", DANCING: "#ec4899",
};

export default function AccountReelsPage() {
  const params = useParams();
  const router = useRouter();
  const accountId = params.accountId as string;

  const [reels, setReels] = useState<Reel[]>([]);
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState("currentViews");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [reelsRes, analyticsRes] = await Promise.all([
        fetch(`/api/reels?accountId=${accountId}&sortBy=${sortBy}&sortOrder=desc`),
        fetch(`/api/analytics?accountId=${accountId}&days=30`),
      ]);
      const reelsData = await reelsRes.json();
      const analyticsData = await analyticsRes.json();

      setReels(reelsData.reels || []);
      if (analyticsData.accounts?.length > 0) {
        setAccount(analyticsData.accounts[0]);
      }
    } catch (error) {
      console.error("Failed to fetch:", error);
    } finally {
      setLoading(false);
    }
  }, [accountId, sortBy]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const nicheColor = NICHE_COLORS[account?.niche || ""] || "#6b7280";

  // Calculate engagement rate
  const avgViews = reels.length > 0 ? Math.round(reels.reduce((s, r) => s + r.currentViews, 0) / reels.length) : 0;
  const avgLikes = reels.length > 0 ? Math.round(reels.reduce((s, r) => s + r.currentLikes, 0) / reels.length) : 0;
  const engagementRate = avgViews > 0 ? ((avgLikes / avgViews) * 100).toFixed(1) : "0";

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Back + Account Header */}
        <div>
          <button onClick={() => router.push("/reels")}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4 transition-colors">
            <ArrowLeft className="h-4 w-4" /> Back to All Accounts
          </button>

          {account && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-full flex items-center justify-center text-xl font-bold text-white shadow-lg"
                  style={{ backgroundColor: nicheColor }}>
                  {(account.igUsername || "?")[0].toUpperCase()}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-2xl font-bold text-gray-900">@{account.igUsername}</h1>
                    <a href={`https://instagram.com/${account.igUsername}/reels/`} target="_blank" rel="noopener noreferrer"
                      className="text-gray-400 hover:text-[#d4a853] transition-colors">
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    <Badge style={{ backgroundColor: `${nicheColor}15`, color: nicheColor, border: `1px solid ${nicheColor}30` }}>
                      {account.niche}
                    </Badge>
                    {account.lastSyncedAt && (
                      <span className="flex items-center gap-1 text-xs text-gray-400">
                        <Clock className="h-3 w-3" />
                        {new Date(account.lastSyncedAt).toLocaleString("sr-RS", { timeZone: "Europe/Belgrade" })}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={fetchData} className="gap-2">
                <RefreshCw className="h-4 w-4" /> Refresh
              </Button>
            </div>
          )}
        </div>

        {/* Account Stats Bar */}
        {account && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { label: "Followers", value: account.currentFollowers, icon: Users, color: "#06b6d4", delta: account.newFollowersToday },
              { label: "Total Views", value: account.totalViews, icon: Eye, color: "#d4a853" },
              { label: "Total Likes", value: account.totalLikes, icon: Heart, color: "#ef4444" },
              { label: "Total Reels", value: reels.length, icon: Film, color: "#a855f7" },
              { label: "Avg Views", value: avgViews, icon: Play, color: "#f59e0b" },
              { label: "Eng. Rate", value: engagementRate + "%", icon: TrendingUp, color: "#22c55e", isText: true },
            ].map((s) => (
              <Card key={s.label}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <s.icon className="h-3.5 w-3.5" style={{ color: s.color }} />
                    <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">{s.label}</span>
                  </div>
                  <p className="text-xl font-bold text-gray-900">
                    {(s as any).isText ? s.value : formatNumber(s.value as number)}
                  </p>
                  {(s as any).delta !== undefined && (s as any).delta !== 0 && (
                    <p className={`text-xs font-medium ${(s as any).delta > 0 ? "text-emerald-500" : "text-red-500"}`}>
                      {(s as any).delta > 0 ? "+" : ""}{(s as any).delta} today
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Controls Bar */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">
            Reel Database <span className="text-gray-400 font-normal text-sm">({reels.length} reels)</span>
          </h2>
          <div className="flex items-center gap-3">
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-[160px] bg-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="currentViews">Most Views</SelectItem>
                <SelectItem value="currentLikes">Most Likes</SelectItem>
                <SelectItem value="lastScrapedAt">Recently Updated</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex bg-white rounded-lg border border-gray-200 p-1">
              <button onClick={() => setViewMode("grid")}
                className={`p-1.5 rounded-md transition-all ${viewMode === "grid" ? "bg-[#0a0a0a] text-[#f5e6c8]" : "text-gray-400"}`}>
                <Grid3x3 className="h-4 w-4" />
              </button>
              <button onClick={() => setViewMode("list")}
                className={`p-1.5 rounded-md transition-all ${viewMode === "list" ? "bg-[#0a0a0a] text-[#f5e6c8]" : "text-gray-400"}`}>
                <List className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Reels Grid / List */}
        {loading ? (
          <div className="p-12 text-center text-gray-400">Loading reels...</div>
        ) : reels.length === 0 ? (
          <div className="p-12 text-center text-gray-400">No reels found for this account.</div>
        ) : viewMode === "grid" ? (
          /* ===== GRID VIEW ===== */
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {reels.map((reel, idx) => (
              <a key={reel.id} href={reel.reelUrl} target="_blank" rel="noopener noreferrer"
                className="group relative rounded-xl overflow-hidden bg-gray-100 aspect-[9/16] shadow-sm hover:shadow-lg transition-all hover:scale-[1.02]"
                style={{ animationDelay: `${idx * 30}ms` }}>
                {/* Thumbnail */}
                {reel.thumbnailUrl ? (
                  <img src={reel.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-200 to-gray-300">
                    <Film className="h-10 w-10 text-gray-400" />
                  </div>
                )}

                {/* Rank badge */}
                {idx < 3 && sortBy === "currentViews" && (
                  <div className={`absolute top-2 left-2 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-md ${
                    idx === 0 ? "bg-yellow-500" : idx === 1 ? "bg-gray-400" : "bg-amber-700"
                  }`}>
                    #{idx + 1}
                  </div>
                )}

                {/* Stats overlay - always visible */}
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-3 pt-8">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <Eye className="h-3.5 w-3.5 text-white/80" />
                      <span className="text-sm font-bold text-white">{formatNumber(reel.currentViews)}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Heart className="h-3.5 w-3.5 text-white/80" />
                      <span className="text-sm font-bold text-white">{formatNumber(reel.currentLikes)}</span>
                    </div>
                  </div>
                  {/* Deltas */}
                  {(reel.viewsDelta !== 0 || reel.likesDelta !== 0) && (
                    <div className="flex items-center justify-between mt-1">
                      {reel.viewsDelta !== 0 && (
                        <span className="text-[10px] font-medium text-emerald-400">
                          +{formatNumber(reel.viewsDelta)} views
                        </span>
                      )}
                      {reel.likesDelta !== 0 && (
                        <span className="text-[10px] font-medium text-emerald-400">
                          +{formatNumber(reel.likesDelta)} likes
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Hover play icon */}
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="w-12 h-12 rounded-full bg-white/30 backdrop-blur-sm flex items-center justify-center">
                    <Play className="h-6 w-6 text-white fill-white ml-0.5" />
                  </div>
                </div>
              </a>
            ))}
          </div>
        ) : (
          /* ===== LIST VIEW ===== */
          <Card>
            <CardContent className="p-0">
              <div className="divide-y divide-gray-100">
                {reels.map((reel, idx) => (
                  <div key={reel.id} className="flex items-center gap-4 p-4 hover:bg-gray-50/50 transition-colors">
                    {/* Rank */}
                    <div className="w-8 text-center text-sm font-medium text-gray-400">
                      {idx + 1}
                    </div>

                    {/* Thumbnail */}
                    <div className="w-14 h-14 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
                      {reel.thumbnailUrl ? (
                        <img src={reel.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Film className="h-5 w-5 text-gray-300" />
                        </div>
                      )}
                    </div>

                    {/* Shortcode + link */}
                    <div className="flex-1 min-w-0">
                      <a href={reel.reelUrl} target="_blank" rel="noopener noreferrer"
                        className="text-sm font-medium text-gray-900 hover:text-[#d4a853] transition-colors flex items-center gap-1.5">
                        {reel.shortcode}
                        <ExternalLink className="h-3 w-3 opacity-40" />
                      </a>
                      {reel.caption && (
                        <p className="text-xs text-gray-400 mt-0.5 truncate max-w-sm">{reel.caption}</p>
                      )}
                    </div>

                    {/* Views */}
                    <div className="text-right min-w-[80px]">
                      <div className="flex items-center gap-1.5 justify-end">
                        <Eye className="h-3.5 w-3.5 text-gray-400" />
                        <span className="text-sm font-semibold text-gray-900">{formatNumber(reel.currentViews)}</span>
                      </div>
                      {reel.viewsDelta !== 0 && (
                        <span className={`text-[10px] font-medium ${reel.viewsDelta > 0 ? "text-emerald-500" : "text-red-500"}`}>
                          {reel.viewsDelta > 0 ? "+" : ""}{formatNumber(reel.viewsDelta)}
                        </span>
                      )}
                    </div>

                    {/* Likes */}
                    <div className="text-right min-w-[80px]">
                      <div className="flex items-center gap-1.5 justify-end">
                        <Heart className="h-3.5 w-3.5 text-gray-400" />
                        <span className="text-sm font-semibold text-gray-900">{formatNumber(reel.currentLikes)}</span>
                      </div>
                      {reel.likesDelta !== 0 && (
                        <span className={`text-[10px] font-medium ${reel.likesDelta > 0 ? "text-emerald-500" : "text-red-500"}`}>
                          {reel.likesDelta > 0 ? "+" : ""}{formatNumber(reel.likesDelta)}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
