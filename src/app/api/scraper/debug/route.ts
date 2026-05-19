// API: Debug endpoint to check reel data quality
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

const SCRAPER_SECRET = process.env.SCRAPER_SECRET || "effortless-scraper-2026";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${SCRAPER_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const reels = await prisma.reel.findMany({
    take: 10,
    orderBy: { currentViews: "desc" },
    select: {
      shortcode: true,
      currentViews: true,
      currentLikes: true,
      thumbnailUrl: true,
      account: { select: { igUsername: true } },
    },
  });

  return NextResponse.json({
    count: await prisma.reel.count(),
    sample: reels.map(r => ({
      shortcode: r.shortcode,
      reelUrl: `https://www.instagram.com/reel/${r.shortcode}/`,
      views: r.currentViews,
      likes: r.currentLikes,
      hasThumb: !!r.thumbnailUrl,
      thumbStart: r.thumbnailUrl?.substring(0, 80) || null,
      account: r.account?.igUsername,
    })),
  });
}
