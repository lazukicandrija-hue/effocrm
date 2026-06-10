// API: Debug endpoint to check reel data quality (scraper secret required)
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

const SCRAPER_SECRET = process.env.SCRAPER_SECRET || "effortless-scraper-2026";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${SCRAPER_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const h24 = new Date(now.getTime() - 24 * 3600e3);
  const d7 = new Date(now.getTime() - 7 * 24 * 3600e3);

  const [total, withPublished, posted24h, posted7d] = await Promise.all([
    prisma.reel.count(),
    prisma.reel.count({ where: { publishedAt: { not: null } } }),
    prisma.reel.count({ where: { publishedAt: { gte: h24 } } }),
    prisma.reel.count({ where: { publishedAt: { gte: d7 } } }),
  ]);

  // Most recently PUBLISHED reels (what the 24h view keys off of)
  const recent = await prisma.reel.findMany({
    where: { publishedAt: { not: null } },
    orderBy: { publishedAt: "desc" },
    take: 8,
    select: {
      shortcode: true,
      publishedAt: true,
      lastScrapedAt: true,
      currentViews: true,
      account: { select: { igUsername: true } },
    },
  });

  // Freshest scrape time across all reels
  const freshest = await prisma.reel.findFirst({
    orderBy: { lastScrapedAt: "desc" },
    select: { lastScrapedAt: true },
  });

  return NextResponse.json({
    now: now.toISOString(),
    totals: {
      reels: total,
      withPublishedAt: withPublished,
      missingPublishedAt: total - withPublished,
      postedLast24h: posted24h,
      postedLast7d: posted7d,
    },
    lastReelScrapeAt: freshest?.lastScrapedAt || null,
    mostRecentlyPublished: recent.map((r) => ({
      account: r.account?.igUsername,
      shortcode: r.shortcode,
      publishedAt: r.publishedAt,
      lastScrapedAt: r.lastScrapedAt,
      views: r.currentViews,
    })),
  });
}
