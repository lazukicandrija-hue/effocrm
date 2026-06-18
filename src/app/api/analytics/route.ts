// API: Instagram analytics - follower growth, daily view tracking per account
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { subDays, startOfDay, endOfDay } from "date-fns";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const accountId = searchParams.get("accountId");
    const days = parseInt(searchParams.get("days") || "7");

    const startDate = startOfDay(subDays(new Date(), days));

    // Build filter
    const accountFilter: any = {};
    if (accountId) {
      accountFilter.accountId = accountId;
    }

    // 1. Get all linked accounts
    const accounts = await prisma.account.findMany({
      where: {
        igUsername: { not: null },
        ownership: { not: "COMPETITOR" },
        ...(accountId ? { id: accountId } : {}),
      },
      select: {
        id: true,
        username: true,
        igUsername: true,
        followers: true,
        niche: true,
        lastSyncedAt: true,
      },
    });

    // 2. Get follower snapshots over time for each account
    const followerHistory = await prisma.accountSnapshot.findMany({
      where: {
        ...accountFilter,
        scrapedAt: { gte: startDate },
        account: { igUsername: { not: null }, ownership: { not: "COMPETITOR" } },
      },
      orderBy: { scrapedAt: "asc" },
      select: {
        accountId: true,
        followers: true,
        scrapedAt: true,
      },
    });

    // Group by date for chart
    const followerByDay: Record<string, Record<string, number>> = {};
    for (const snap of followerHistory) {
      // Use Serbian timezone (UTC+2)
      const serbianTime = new Date(snap.scrapedAt.getTime() + 2 * 60 * 60 * 1000);
      const dateKey = serbianTime.toISOString().split("T")[0];
      
      if (!followerByDay[dateKey]) {
        followerByDay[dateKey] = {};
      }
      // Keep the LAST snapshot of each day (closest to 23:59)
      followerByDay[dateKey][snap.accountId] = snap.followers;
    }

    // 3. Calculate new followers per day per account
    const dailyFollowerGrowth: any[] = [];
    const sortedDates = Object.keys(followerByDay).sort();
    
    for (let i = 0; i < sortedDates.length; i++) {
      const date = sortedDates[i];
      const prevDate = i > 0 ? sortedDates[i - 1] : null;
      
      const entry: any = { date };
      let totalNew = 0;
      let totalFollowers = 0;

      for (const acc of accounts) {
        const current = followerByDay[date]?.[acc.id] || 0;
        const previous = prevDate ? (followerByDay[prevDate]?.[acc.id] || 0) : 0;
        const newFollowers = previous > 0 ? current - previous : 0;
        
        entry[`${acc.igUsername}_followers`] = current;
        entry[`${acc.igUsername}_new`] = newFollowers;
        totalNew += newFollowers;
        totalFollowers += current;
      }
      
      entry.totalFollowers = totalFollowers;
      entry.totalNew = totalNew;
      dailyFollowerGrowth.push(entry);
    }

    // 4. Get reel view growth (total views gained per day)
    // Get all reels with their snapshot history
    const reelSnapshots = await prisma.reelSnapshot.findMany({
      where: {
        scrapedAt: { gte: startDate },
        reel: {
          account: { igUsername: { not: null }, ownership: { not: "COMPETITOR" } },
          ...(accountId ? { accountId } : {}),
        },
      },
      include: {
        reel: {
          select: {
            accountId: true,
            shortcode: true,
            account: {
              select: { igUsername: true },
            },
          },
        },
      },
      orderBy: { scrapedAt: "asc" },
    });

    // Group reel snapshots by day and reel, keeping latest per day
    const reelViewsByDay: Record<string, Record<string, { views: number; likes: number }>> = {};
    for (const snap of reelSnapshots) {
      const serbianTime = new Date(snap.scrapedAt.getTime() + 2 * 60 * 60 * 1000);
      const dateKey = serbianTime.toISOString().split("T")[0];
      const reelKey = snap.reel.shortcode;
      
      if (!reelViewsByDay[dateKey]) {
        reelViewsByDay[dateKey] = {};
      }
      reelViewsByDay[dateKey][reelKey] = {
        views: snap.views,
        likes: snap.likes,
      };
    }

    // Calculate daily new views (views gained today = today total - yesterday total)
    const viewDates = Object.keys(reelViewsByDay).sort();
    const dailyViewGrowth: any[] = [];

    for (let i = 0; i < viewDates.length; i++) {
      const date = viewDates[i];
      const prevDate = i > 0 ? viewDates[i - 1] : null;
      
      let totalNewViews = 0;
      let totalNewLikes = 0;
      let totalViews = 0;
      let totalLikes = 0;

      const todayReels = reelViewsByDay[date];
      const prevReels = prevDate ? reelViewsByDay[prevDate] : null;

      for (const [reelKey, data] of Object.entries(todayReels)) {
        totalViews += data.views;
        totalLikes += data.likes;
        
        const prevData = prevReels?.[reelKey];
        if (prevData) {
          totalNewViews += Math.max(0, data.views - prevData.views);
          totalNewLikes += Math.max(0, data.likes - prevData.likes);
        } else if (!prevDate) {
          // First day - count all as new
          totalNewViews += data.views;
          totalNewLikes += data.likes;
        }
      }

      dailyViewGrowth.push({
        date,
        newViews: totalNewViews,
        newLikes: totalNewLikes,
        totalViews,
        totalLikes,
      });
    }

    // 5. Per-account summary
    const accountSummaries = await Promise.all(
      accounts.map(async (acc) => {
        const reelCount = await prisma.reel.count({
          where: { accountId: acc.id },
        });
        
        const totalViews = await prisma.reel.aggregate({
          where: { accountId: acc.id },
          _sum: { currentViews: true, currentLikes: true },
        });

        // Get today's first snapshot and latest for follower delta
        const todayStart = startOfDay(new Date());
        const firstToday = await prisma.accountSnapshot.findFirst({
          where: { accountId: acc.id, scrapedAt: { gte: todayStart } },
          orderBy: { scrapedAt: "asc" },
        });
        const latestToday = await prisma.accountSnapshot.findFirst({
          where: { accountId: acc.id, scrapedAt: { gte: todayStart } },
          orderBy: { scrapedAt: "desc" },
        });

        const newFollowersToday = firstToday && latestToday
          ? latestToday.followers - firstToday.followers
          : 0;

        return {
          id: acc.id,
          username: acc.username,
          igUsername: acc.igUsername,
          niche: acc.niche,
          currentFollowers: acc.followers,
          newFollowersToday,
          totalReels: reelCount,
          totalViews: totalViews._sum.currentViews || 0,
          totalLikes: totalViews._sum.currentLikes || 0,
          lastSyncedAt: acc.lastSyncedAt,
        };
      })
    );

    return NextResponse.json({
      accounts: accountSummaries,
      followerGrowth: dailyFollowerGrowth,
      viewGrowth: dailyViewGrowth,
      period: { days, startDate: startDate.toISOString() },
    });
  } catch (error) {
    console.error("Analytics API error:", error);
    return NextResponse.json({ error: "Failed to fetch analytics" }, { status: 500 });
  }
}
