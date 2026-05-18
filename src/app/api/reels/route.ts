// API: Reels analytics data for the CRM dashboard
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { startOfDay, subDays, subHours } from "date-fns";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const accountId = searchParams.get("accountId");
    const igUsername = searchParams.get("igUsername");
    const period = searchParams.get("period") || "7d";
    const sortBy = searchParams.get("sortBy") || "currentViews";
    const sortOrder = searchParams.get("sortOrder") || "desc";

    // Build reel filter
    const reelFilter: any = {};
    if (accountId) {
      reelFilter.accountId = accountId;
    }
    if (igUsername) {
      reelFilter.account = { igUsername: igUsername.toLowerCase() };
    }

    // Get all reels with latest snapshot data
    const reels = await prisma.reel.findMany({
      where: reelFilter,
      include: {
        account: {
          select: {
            id: true,
            username: true,
            igUsername: true,
            niche: true,
          },
        },
        snapshots: {
          orderBy: { scrapedAt: "desc" },
          take: 2, // current and previous for delta
        },
      },
      orderBy: { [sortBy]: sortOrder as "asc" | "desc" },
    });

    // Calculate deltas for each reel
    const reelsWithDeltas = reels.map((reel) => {
      const current = reel.snapshots[0];
      const previous = reel.snapshots[1];

      const viewsDelta = current && previous ? current.views - previous.views : 0;
      const likesDelta = current && previous ? current.likes - previous.likes : 0;

      return {
        id: reel.id,
        shortcode: reel.shortcode,
        thumbnailUrl: reel.thumbnailUrl,
        caption: reel.caption,
        publishedAt: reel.publishedAt,
        currentViews: reel.currentViews,
        currentLikes: reel.currentLikes,
        currentComments: reel.currentComments,
        viewsDelta,
        likesDelta,
        lastScrapedAt: reel.lastScrapedAt,
        account: reel.account,
        reelUrl: `https://www.instagram.com/reel/${reel.shortcode}/`,
      };
    });

    // Summary stats
    const totalViews = reels.reduce((sum, r) => sum + r.currentViews, 0);
    const totalLikes = reels.reduce((sum, r) => sum + r.currentLikes, 0);
    const totalReels = reels.length;

    // Get views gained today (sum of all deltas from last hour snapshots)
    const oneHourAgo = subHours(new Date(), 1);
    const recentSnapshots = await prisma.reelSnapshot.findMany({
      where: {
        reel: reelFilter,
        scrapedAt: { gte: oneHourAgo },
      },
    });

    return NextResponse.json({
      reels: reelsWithDeltas,
      summary: {
        totalViews,
        totalLikes,
        totalReels,
      },
    });
  } catch (error) {
    console.error("Reels API error:", error);
    return NextResponse.json({ error: "Failed to fetch reels" }, { status: 500 });
  }
}
