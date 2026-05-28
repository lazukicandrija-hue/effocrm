// API: Accounts CRUD
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

// GET - List all accounts
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") || "";
    const modelId = searchParams.get("modelId");
    const niche = searchParams.get("niche");
    const status = searchParams.get("status");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const sortBy = searchParams.get("sortBy") || "position";
    const sortOrder = searchParams.get("sortOrder") || "asc";

    const where: any = {};

    if (search) {
      where.username = { contains: search, mode: "insensitive" };
    }
    if (modelId && modelId !== "all") {
      where.modelId = modelId;
    }
    if (niche && niche !== "all") {
      where.niche = { has: niche };
    }
    if (status && status !== "all") {
      where.status = status;
    }

    const [accounts, total] = await Promise.all([
      prisma.account.findMany({
        where,
        include: {
          model: { select: { name: true } },
          dailyStats: {
            orderBy: { date: "desc" },
            take: 1,
          },
        },
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.account.count({ where }),
    ]);

    // Get total views for each account
    const accountsWithViews = await Promise.all(
      accounts.map(async (account) => {
        const totalViews = await prisma.dailyStat.aggregate({
          where: { accountId: account.id },
          _sum: { instaViews: true, fbViews: true },
        });

        // Get today's views
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayViews = await prisma.dailyStat.findFirst({
          where: {
            accountId: account.id,
            date: { gte: today },
          },
        });

        return {
          ...account,
          totalInstaViews: totalViews._sum.instaViews || 0,
          totalFbViews: totalViews._sum.fbViews || 0,
          totalViews: (totalViews._sum.instaViews || 0) + (totalViews._sum.fbViews || 0),
          viewsToday: todayViews
            ? todayViews.instaViews + todayViews.fbViews
            : 0,
          instaViewsToday: todayViews?.instaViews || 0,
          fbViewsToday: todayViews?.fbViews || 0,
        };
      })
    );

    return NextResponse.json({
      accounts: accountsWithViews,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error("Accounts fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch accounts" }, { status: 500 });
  }
}

// POST - Create new account
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const {
      username,
      modelId,
      niche,
      decision,
      status,
      followers,
      notes,
      profileUrl,
      igUsername,
      login,
      fbPageLink,
      hasFacebook,
      linkInBio,
      lastPost,
      accountCreatedDate,
    } = body;

    // Validation
    if (!username) {
      return NextResponse.json(
        { error: "Username is required" },
        { status: 400 }
      );
    }

    const cleanUsername = username.replace("@", "");

    // Check username uniqueness
    const existing = await prisma.account.findUnique({
      where: { username: cleanUsername },
    });
    if (existing) {
      return NextResponse.json(
        { error: "An account with this username already exists" },
        { status: 400 }
      );
    }

    // Default to the "Poppy" model if none provided
    let resolvedModelId = modelId;
    if (!resolvedModelId) {
      const poppy = await prisma.model.upsert({
        where: { id: "poppy-model-id" },
        update: {},
        create: { id: "poppy-model-id", name: "Poppy" },
      });
      resolvedModelId = poppy.id;
    }

    const account = await prisma.account.create({
      data: {
        username: cleanUsername,
        igUsername: igUsername ? igUsername.replace("@", "").toLowerCase() : cleanUsername.toLowerCase(),
        modelId: resolvedModelId,
        niche: Array.isArray(niche) ? niche : niche ? [niche] : [],
        decision: decision || null,
        status: status || "ACTIVE",
        followers: followers || 0,
        notes: notes || null,
        profileUrl: profileUrl || `https://instagram.com/${cleanUsername}`,
        login: login || null,
        fbPageLink: fbPageLink || null,
        hasFacebook: !!hasFacebook,
        linkInBio: !!linkInBio,
        lastPost: lastPost ? new Date(lastPost) : null,
        accountCreatedDate: accountCreatedDate ? new Date(accountCreatedDate) : null,
      },
      include: { model: { select: { name: true } } },
    });

    return NextResponse.json(account, { status: 201 });
  } catch (error) {
    console.error("Account create error:", error);
    return NextResponse.json({ error: "Failed to create account" }, { status: 500 });
  }
}
