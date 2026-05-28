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
          const { shortcode, views, likes, comments, thumbnailUrl, caption, publishedAt } = reelData;
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
              ...(thumbnailUrl ? { thumbnailUrl } : {}),
              ...(publishedAt ? { publishedAt: new Date(publishedAt) } : {}),
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
              publishedAt: publishedAt ? new Date(publishedAt) : null,
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
      // "Views today" is the number of views GAINED today, not the lifetime
      // total. It is computed purely from snapshots and ONLY for reels we
      // actually measured today: for each such reel, (latest snapshot today −
      // last snapshot before today). This captures an older reel that surges
      // today, ignores dormant reels, and — crucially — never counts a reel we
      // didn't re-measure (stale data) or dumps a reel's whole back-catalogue
      // the first time we see it (no prior baseline ⇒ contributes 0 that day).

      // Today's midnight in Serbian time (UTC+2 CEST; switch to 1 for CET).
      const now = new Date();
      const serbianOffset = 2;
      const serbianNow = new Date(now.getTime() + serbianOffset * 60 * 60 * 1000);
      const todaySerbian = new Date(serbianNow.toISOString().split("T")[0] + "T00:00:00.000Z");

      // Only reels with a snapshot taken today (i.e. measured this run/day).
      const reelsMeasuredToday = await prisma.reel.findMany({
        where: {
          accountId: account.id,
          snapshots: { some: { scrapedAt: { gte: todaySerbian } } },
        },
        select: { id: true },
      });

      let viewsToday = 0;
      for (const r of reelsMeasuredToday) {
        const latestToday = await prisma.reelSnapshot.findFirst({
          where: { reelId: r.id, scrapedAt: { gte: todaySerbian } },
          orderBy: { scrapedAt: "desc" },
          select: { views: true },
        });
        if (!latestToday) continue;

        // Reference = the reel's view count at the start of today: the last
        // snapshot before midnight if we have one. For a reel first seen today
        // (e.g. just posted, or right after a baseline reset) there is no prior
        // snapshot, so fall back to its FIRST snapshot today — that way views
        // gained over the rest of today still count, instead of dumping the
        // reel's whole view count as "today".
        const baselineSnap = await prisma.reelSnapshot.findFirst({
          where: { reelId: r.id, scrapedAt: { lt: todaySerbian } },
          orderBy: { scrapedAt: "desc" },
          select: { views: true },
        });
        let referenceViews: number;
        if (baselineSnap) {
          referenceViews = baselineSnap.views;
        } else {
          const firstToday = await prisma.reelSnapshot.findFirst({
            where: { reelId: r.id, scrapedAt: { gte: todaySerbian } },
            orderBy: { scrapedAt: "asc" },
            select: { views: true },
          });
          referenceViews = firstToday?.views ?? latestToday.views;
        }
        viewsToday += Math.max(0, latestToday.views - referenceViews);
      }

      // Follower delta today: current followers − followers at start of today
      // (last snapshot taken before midnight).
      const baselineFollowerSnap = await prisma.accountSnapshot.findFirst({
        where: { accountId: account.id, scrapedAt: { lt: todaySerbian } },
        orderBy: { scrapedAt: "desc" },
        select: { followers: true },
      });
      const baselineFollowers = baselineFollowerSnap?.followers || 0;
      const newFollowersToday = baselineFollowers > 0 ? followers - baselineFollowers : 0;

      await prisma.dailyStat.upsert({
        where: {
          accountId_date: {
            accountId: account.id,
            date: todaySerbian,
          },
        },
        update: {
          instaViews: viewsToday,
          followers: newFollowersToday,
        },
        create: {
          accountId: account.id,
          date: todaySerbian,
          instaViews: viewsToday,
          followers: newFollowersToday,
        },
      });

      results.push({
        igUsername,
        status: "synced",
        followers,
        newFollowersToday,
        reelsProcessed,
        viewsToday,
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
