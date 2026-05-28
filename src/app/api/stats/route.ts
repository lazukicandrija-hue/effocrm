// API: Dashboard stats
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { startOfDay, startOfWeek, startOfMonth, subDays, endOfDay } from "date-fns";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const modelId = searchParams.get("modelId");
    const period = searchParams.get("period") || "today";
    const customFrom = searchParams.get("from");
    const customTo = searchParams.get("to");

    // Build account filter
    const accountFilter: any = {};
    if (modelId && modelId !== "all") {
      accountFilter.modelId = modelId;
    }

    // Calculate date ranges
    const now = new Date();
    const today = startOfDay(now);
    const yesterday = startOfDay(subDays(now, 1));
    const weekStart = startOfWeek(now, { weekStartsOn: 1 });
    const monthStart = startOfMonth(now);

    let periodStart: Date;
    let periodEnd: Date = endOfDay(now);

    switch (period) {
      case "week":
        periodStart = weekStart;
        break;
      case "month":
        periodStart = monthStart;
        break;
      case "custom":
        periodStart = customFrom ? new Date(customFrom) : today;
        periodEnd = customTo ? endOfDay(new Date(customTo)) : endOfDay(now);
        break;
      default:
        periodStart = today;
    }

    // Get all accounts with stats
    const accounts = await prisma.account.findMany({
      where: accountFilter,
      include: {
        dailyStats: {
          where: {
            date: { gte: periodStart, lte: periodEnd },
          },
        },
      },
    });

    // Get yesterday's stats for delta comparison
    const yesterdayStats = await prisma.dailyStat.findMany({
      where: {
        date: { gte: yesterday, lt: today },
        account: accountFilter,
      },
    });

    // Get today's stats
    const todayStats = await prisma.dailyStat.findMany({
      where: {
        date: { gte: today, lte: endOfDay(now) },
        account: accountFilter,
      },
    });

    // Calculate stats
    const totalAccounts = accounts.length;
    const activeAccounts = accounts.filter((a) => a.status === "ACTIVE").length;
    const warningAccounts = accounts.filter((a) => a.status === "WARNING").length;
    const pausedAccounts = accounts.filter((a) => a.status === "PAUSED").length;
    const bannedAccounts = accounts.filter((a) => a.status === "BANNED").length;

    const viewsToday = todayStats.reduce((sum, s) => sum + s.instaViews + s.fbViews, 0);
    const viewsYesterday = yesterdayStats.reduce((sum, s) => sum + s.instaViews + s.fbViews, 0);

    // Period views
    const viewsPeriod = accounts.reduce(
      (sum, a) =>
        sum + a.dailyStats.reduce((s, d) => s + d.instaViews + d.fbViews, 0),
      0
    );

    // Views this week
    const weekStats = await prisma.dailyStat.findMany({
      where: {
        date: { gte: weekStart, lte: endOfDay(now) },
        account: accountFilter,
      },
    });
    const viewsThisWeek = weekStats.reduce((sum, s) => sum + s.instaViews + s.fbViews, 0);

    // Views this month
    const monthStats = await prisma.dailyStat.findMany({
      where: {
        date: { gte: monthStart, lte: endOfDay(now) },
        account: accountFilter,
      },
    });
    const viewsThisMonth = monthStats.reduce((sum, s) => sum + s.instaViews + s.fbViews, 0);

    // Followers today
    const followersToday = todayStats.reduce((sum, s) => sum + s.followers, 0);
    const followersYesterday = yesterdayStats.reduce((sum, s) => sum + s.followers, 0);

    // Accounts added today
    const accountsAddedToday = await prisma.account.count({
      where: {
        ...accountFilter,
        dateCreated: { gte: today },
      },
    });

    // Views by niche
    const viewsByNiche = await Promise.all(
      ["Golf", "Talking", "Omegle", "Podcast", "Dancing", "Motion Control"].map(async (niche) => {
        const nicheStats = await prisma.dailyStat.findMany({
          where: {
            date: { gte: periodStart, lte: periodEnd },
            account: {
              ...accountFilter,
              niche: { has: niche },
            },
          },
        });
        return {
          niche,
          instaViews: nicheStats.reduce((sum, s) => sum + s.instaViews, 0),
          fbViews: nicheStats.reduce((sum, s) => sum + s.fbViews, 0),
          total: nicheStats.reduce((sum, s) => sum + s.instaViews + s.fbViews, 0),
        };
      })
    );

    // Views over time (for line chart)
    const daysInPeriod = Math.ceil(
      (periodEnd.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24)
    );
    const timelineStats = await prisma.dailyStat.groupBy({
      by: ["date"],
      where: {
        date: { gte: periodStart, lte: periodEnd },
        account: accountFilter,
      },
      _sum: {
        instaViews: true,
        fbViews: true,
        followers: true,
      },
      orderBy: { date: "asc" },
    });

    const viewsOverTime = timelineStats.map((s) => ({
      date: s.date.toISOString().split("T")[0],
      instaViews: s._sum.instaViews || 0,
      fbViews: s._sum.fbViews || 0,
      total: (s._sum.instaViews || 0) + (s._sum.fbViews || 0),
      followers: s._sum.followers || 0,
    }));

    return NextResponse.json({
      totalAccounts,
      activeAccounts,
      warningAccounts,
      pausedAccounts,
      bannedAccounts,
      viewsToday,
      viewsYesterday,
      viewsDelta: viewsToday - viewsYesterday,
      viewsThisWeek,
      viewsThisMonth,
      viewsPeriod,
      followersToday,
      followersDelta: followersToday - followersYesterday,
      accountsAddedToday,
      viewsByNiche,
      viewsOverTime,
      statusDistribution: [
        { name: "Active", value: activeAccounts, color: "#22c55e" },
        { name: "Warning", value: warningAccounts, color: "#eab308" },
        { name: "Paused", value: pausedAccounts, color: "#6b7280" },
        { name: "Banned", value: bannedAccounts, color: "#ef4444" },
      ],
    });
  } catch (error) {
    console.error("Dashboard stats error:", error);
    return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 });
  }
}
