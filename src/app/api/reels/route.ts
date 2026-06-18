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

    // Account filter (reused for the list and the 24h summary)
    // Reel-level filter; always exclude competitor accounts' reels.
    const accountFilter: any = { account: { ownership: { not: "COMPETITOR" } } };
    if (accountId) accountFilter.accountId = accountId;
    if (igUsername) accountFilter.account = { ...accountFilter.account, igUsername: igUsername.toLowerCase() };

    // Filter by when the reel was POSTED (publishedAt) — powers the "last 24h" view.
    const reelFilter: any = { ...accountFilter };
    const postedWithin = searchParams.get("postedWithin"); // "24h" | "7d" | null/all
    if (postedWithin === "24h") {
      reelFilter.publishedAt = { gte: subHours(new Date(), 24) };
    } else if (postedWithin === "7d") {
      reelFilter.publishedAt = { gte: subDays(new Date(), 7) };
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
      const commentsDelta = current && previous ? current.comments - previous.comments : 0;

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
        commentsDelta,
        lastScrapedAt: reel.lastScrapedAt,
        account: reel.account,
        reelUrl: `https://www.instagram.com/reel/${reel.shortcode}/`,
      };
    });

    // Summary stats
    const totalViews = reels.reduce((sum, r) => sum + r.currentViews, 0);
    const totalLikes = reels.reduce((sum, r) => sum + r.currentLikes, 0);
    const totalReels = reels.length;

    // "Last 24h" summary — aggregate of reels POSTED in the last 24 hours
    // (independent of the postedWithin filter, but respects the account filter).
    const recentlyPosted = await prisma.reel.findMany({
      where: { ...accountFilter, publishedAt: { gte: subHours(new Date(), 24) } },
      select: { currentViews: true, currentLikes: true, currentComments: true },
    });
    const posted24h = {
      count: recentlyPosted.length,
      views: recentlyPosted.reduce((s, r) => s + r.currentViews, 0),
      likes: recentlyPosted.reduce((s, r) => s + r.currentLikes, 0),
      comments: recentlyPosted.reduce((s, r) => s + r.currentComments, 0),
    };

    return NextResponse.json({
      reels: reelsWithDeltas,
      summary: { totalViews, totalLikes, totalReels },
      posted24h,
    });
  } catch (error) {
    console.error("Reels API error:", error);
    return NextResponse.json({ error: "Failed to fetch reels" }, { status: 500 });
  }
}
