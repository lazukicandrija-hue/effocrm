// API: Receives scraped Instagram data from the Playwright scraper
// This endpoint is NOT auth-protected (scraper calls it with a secret key)
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

const SCRAPER_SECRET = process.env.SCRAPER_SECRET || "effortless-scraper-2026";

export async function POST(req: NextRequest) {
  try {
    // Verify scraper secret
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${SCRAPER_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { accounts } = body;

    if (!accounts || !Array.isArray(accounts)) {
      return NextResponse.json(
        { error: "Invalid payload - expected { accounts: [...] }" },
        { status: 400 }
      );
    }

    const results = [];

    for (const accountData of accounts) {
      const { igUsername, followers, following, postsCount, reels } = accountData;

      if (!igUsername) continue;

      // Find the CRM account by igUsername
      const account = await prisma.account.findFirst({
        where: { igUsername: igUsername.toLowerCase() },
      });

      if (!account) {
        results.push({ igUsername, status: "not_found", message: "No CRM account linked" });
        continue;
      }

      // 1. Update Account followers
      await prisma.account.update({
        where: { id: account.id },
        data: {
          followers: followers || account.followers,
          lastSyncedAt: new Date(),
        },
      });

      // 2. Create AccountSnapshot (hourly follower tracking)
      await prisma.accountSnapshot.create({
        data: {
          accountId: account.id,
          followers: followers || 0,
          following: following || 0,
          postsCount: postsCount || 0,
        },
      });

      // 3. Process reels
      let reelsProcessed = 0;
      if (reels && Array.isArray(reels)) {
        for (const reelData of reels) {
          const { shortcode, views, likes, comments, thumbnailUrl, caption } = reelData;
          if (!shortcode) continue;

          // Upsert the reel
          const reel = await prisma.reel.upsert({
            where: {
              accountId_shortcode: {
                accountId: account.id,
                shortcode,
              },
            },
            update: {
              currentViews: views || 0,
              currentLikes: likes || 0,
              currentComments: comments || 0,
              thumbnailUrl: thumbnailUrl || undefined,
              lastScrapedAt: new Date(),
            },
            create: {
              accountId: account.id,
              shortcode,
              currentViews: views || 0,
              currentLikes: likes || 0,
              currentComments: comments || 0,
              thumbnailUrl: thumbnailUrl || null,
              caption: caption || null,
              lastScrapedAt: new Date(),
            },
          });

          // Create ReelSnapshot for tracking over time
          await prisma.reelSnapshot.create({
            data: {
              reelId: reel.id,
              views: views || 0,
              likes: likes || 0,
              comments: comments || 0,
            },
          });

          reelsProcessed++;
        }
      }

      // 4. Update DailyStat for today
      // Calculate total views across ALL reels for this account
      const allReels = await prisma.reel.findMany({
        where: { accountId: account.id },
        select: { currentViews: true, currentLikes: true },
      });
      const totalReelViews = allReels.reduce((sum, r) => sum + r.currentViews, 0);

      // Get today's date at midnight (Serbian time = UTC+1/+2)
      // We use UTC+2 (CEST) for Serbian time
      const now = new Date();
      const serbianOffset = 2; // CEST (summer) - adjust to 1 for CET (winter)
      const serbianNow = new Date(now.getTime() + serbianOffset * 60 * 60 * 1000);
      const todaySerbian = new Date(serbianNow.toISOString().split("T")[0] + "T00:00:00.000Z");

      // Get yesterday's midnight snapshot for follower delta
      const yesterdaySerbian = new Date(todaySerbian);
      yesterdaySerbian.setDate(yesterdaySerbian.getDate() - 1);

      // Get the midnight snapshot (last snapshot from yesterday ~23:59)
      const midnightSnapshot = await prisma.accountSnapshot.findFirst({
        where: {
          accountId: account.id,
          scrapedAt: {
            gte: yesterdaySerbian,
            lt: todaySerbian,
          },
        },
        orderBy: { scrapedAt: "desc" },
      });

      const midnightFollowers = midnightSnapshot?.followers || 0;
      const newFollowersToday = midnightFollowers > 0 ? followers - midnightFollowers : 0;

      // Get previous day's total views for delta
      const yesterdayDailyStat = await prisma.dailyStat.findUnique({
        where: {
          accountId_date: {
            accountId: account.id,
            date: yesterdaySerbian,
          },
        },
      });

      const previousTotalViews = yesterdayDailyStat?.instaViews || 0;
      // New views today = current total views - yesterday's recorded total
      // But if this is the first day, just use total views
      const newViewsToday = previousTotalViews > 0 
        ? Math.max(0, totalReelViews - previousTotalViews)
        : totalReelViews;

      await prisma.dailyStat.upsert({
        where: {
          accountId_date: {
            accountId: account.id,
            date: todaySerbian,
          },
        },
        update: {
          instaViews: totalReelViews, // Store cumulative total views
          followers: newFollowersToday,
        },
        create: {
          accountId: account.id,
          date: todaySerbian,
          instaViews: totalReelViews,
          followers: newFollowersToday,
        },
      });

      results.push({
        igUsername,
        status: "synced",
        followers,
        newFollowersToday,
        reelsProcessed,
        totalReelViews,
      });
    }

    return NextResponse.json({
      success: true,
      syncedAt: new Date().toISOString(),
      results,
    });
  } catch (error) {
    console.error("Scraper sync error:", error);
    return NextResponse.json(
      { error: "Sync failed", details: String(error) },
      { status: 500 }
    );
  }
}

// GET - Check sync status
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${SCRAPER_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get all accounts with igUsername set
    const accounts = await prisma.account.findMany({
      where: { igUsername: { not: null } },
      select: {
        id: true,
        username: true,
        igUsername: true,
        lastSyncedAt: true,
        followers: true,
      },
    });

    return NextResponse.json({ accounts });
  } catch (error) {
    return NextResponse.json({ error: "Failed to get sync status" }, { status: 500 });
  }
}
