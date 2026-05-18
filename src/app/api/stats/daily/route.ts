// API: Daily stats (add views)
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

// POST - Add or update daily stats
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { accountId, date, instaViews, fbViews, followers } = body;

    if (!accountId) {
      return NextResponse.json(
        { error: "Account ID is required" },
        { status: 400 }
      );
    }

    // Verify account exists
    const account = await prisma.account.findUnique({
      where: { id: accountId },
    });
    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    const statDate = date ? new Date(date) : new Date();
    statDate.setHours(0, 0, 0, 0);

    // Upsert: update if exists for this date, create if not
    const stat = await prisma.dailyStat.upsert({
      where: {
        accountId_date: {
          accountId,
          date: statDate,
        },
      },
      update: {
        instaViews: instaViews || 0,
        fbViews: fbViews || 0,
        followers: followers || 0,
      },
      create: {
        accountId,
        date: statDate,
        instaViews: instaViews || 0,
        fbViews: fbViews || 0,
        followers: followers || 0,
      },
    });

    // Update account follower count
    if (followers) {
      await prisma.account.update({
        where: { id: accountId },
        data: { followers },
      });
    }

    return NextResponse.json(stat, { status: 201 });
  } catch (error) {
    console.error("Stats create error:", error);
    return NextResponse.json({ error: "Failed to save stats" }, { status: 500 });
  }
}

// POST bulk - Add multiple stats at once
export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { entries } = body; // Array of { username, instaViews, fbViews, followers, date }

    if (!entries || !Array.isArray(entries) || entries.length === 0) {
      return NextResponse.json(
        { error: "Entries array is required" },
        { status: 400 }
      );
    }

    const results: any[] = [];
    const errors: any[] = [];

    for (const entry of entries) {
      try {
        const account = await prisma.account.findUnique({
          where: { username: entry.username },
        });

        if (!account) {
          errors.push({ username: entry.username, error: "Account not found" });
          continue;
        }

        const statDate = entry.date ? new Date(entry.date) : new Date();
        statDate.setHours(0, 0, 0, 0);

        const stat = await prisma.dailyStat.upsert({
          where: {
            accountId_date: {
              accountId: account.id,
              date: statDate,
            },
          },
          update: {
            instaViews: entry.instaViews || 0,
            fbViews: entry.fbViews || 0,
            followers: entry.followers || 0,
          },
          create: {
            accountId: account.id,
            date: statDate,
            instaViews: entry.instaViews || 0,
            fbViews: entry.fbViews || 0,
            followers: entry.followers || 0,
          },
        });

        // Update account follower count
        if (entry.followers) {
          await prisma.account.update({
            where: { id: account.id },
            data: { followers: entry.followers },
          });
        }

        results.push({ username: entry.username, stat });
      } catch (err) {
        errors.push({ username: entry.username, error: "Failed to process" });
      }
    }

    return NextResponse.json({
      success: results.length,
      failed: errors.length,
      results,
      errors,
    });
  } catch (error) {
    console.error("Bulk stats error:", error);
    return NextResponse.json({ error: "Failed to process bulk stats" }, { status: 500 });
  }
}
