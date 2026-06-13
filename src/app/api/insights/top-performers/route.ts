// API: Top-performing reels — "what's working".
// Ranks reels by views, momentum (views gained over the window, from ReelSnapshot
// deltas), and over-performance vs each account's OWN baseline (so a 40k reel on a
// small account outranks a 40k reel on a big one). Degrades gracefully before the
// daily scrape has built up history (momentum falls back to raw views).
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { subDays } from "date-fns";

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { searchParams } = new URL(req.url);
    const days = parseInt(searchParams.get("days") || "7");
    const limit = parseInt(searchParams.get("limit") || "40");
    const sort = (searchParams.get("sort") || "views").toLowerCase();
    const since = subDays(new Date(), days);

    const reels = await prisma.reel.findMany({
      where: { account: { igUsername: { not: null } } },
      select: {
        id: true,
        shortcode: true,
        caption: true,
        thumbnailUrl: true,
        publishedAt: true,
        currentViews: true,
        currentLikes: true,
        currentComments: true,
        account: { select: { id: true, username: true, igUsername: true, niche: true } },
        // earliest snapshot still inside the window, to measure views gained since
        snapshots: {
          where: { scrapedAt: { gte: since } },
          orderBy: { scrapedAt: "asc" },
          take: 1,
          select: { views: true, scrapedAt: true },
        },
      },
    });

    // Per-account baseline = median current views (min 1 to avoid divide-by-zero).
    const byAccount: Record<string, number[]> = {};
    for (const r of reels) (byAccount[r.account.id] ||= []).push(r.currentViews);
    const baseline: Record<string, number> = {};
    for (const [acc, v] of Object.entries(byAccount)) baseline[acc] = median(v) || 1;

    const scored = reels.map((r) => {
      const base = baseline[r.account.id] || 1;
      const overIndex = r.currentViews / base;
      const prior = r.snapshots[0]?.views ?? null;
      const viewsGained = prior != null ? Math.max(0, r.currentViews - prior) : null;
      const ageDays = r.publishedAt
        ? Math.max(1, (Date.now() - new Date(r.publishedAt).getTime()) / 86400000)
        : null;
      const momentum = viewsGained ?? r.currentViews; // fall back to raw views pre-history
      const recencyBoost = ageDays != null && ageDays <= days ? 1.3 : 1;
      const score = (overIndex * 0.6 + Math.log10(momentum + 10) * 0.4) * recencyBoost;
      return {
        id: r.id,
        shortcode: r.shortcode,
        url: `https://www.instagram.com/reel/${r.shortcode}/`,
        caption: r.caption ? r.caption.slice(0, 140) : null,
        thumbnailUrl: r.thumbnailUrl,
        account: r.account.igUsername || r.account.username,
        niche: r.account.niche,
        publishedAt: r.publishedAt,
        views: r.currentViews,
        likes: r.currentLikes,
        comments: r.currentComments,
        viewsGained,
        overIndex: Math.round(overIndex * 10) / 10,
        score: Math.round(score * 100) / 100,
      };
    });

    // Default: raw views (most intuitive). "breakout" = the composite score that
    // surfaces reels punching above their own account's baseline.
    if (sort === "breakout") scored.sort((a, b) => b.score - a.score);
    else scored.sort((a, b) => b.views - a.views);

    return NextResponse.json({
      reels: scored.slice(0, limit),
      total: scored.length,
      note: scored.length && scored.every((s) => s.viewsGained == null)
        ? "Momentum (views gained) appears once the daily scrape has a few days of history."
        : undefined,
    });
  } catch (e: any) {
    console.error("top-performers error:", e);
    return NextResponse.json({ error: e?.message || "error" }, { status: 500 });
  }
}
