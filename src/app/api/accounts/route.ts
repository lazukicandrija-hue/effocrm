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

    // Competitors are Account rows (ownership=COMPETITOR) but live ONLY in the
    // Competitors tab — never show them in the Accounts tab.
    const where: any = { ownership: { not: "COMPETITOR" } };

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

    // Aggregate views per account in TWO queries (not N+1) — avoids firing dozens
    // of concurrent queries that can exhaust the DB connection pool.
    const accountIds = accounts.map((a) => a.id);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [totalsAgg, todayAgg] = await Promise.all([
      prisma.dailyStat.groupBy({
        by: ["accountId"],
        where: { accountId: { in: accountIds } },
        _sum: { instaViews: true, fbViews: true },
      }),
      prisma.dailyStat.groupBy({
        by: ["accountId"],
        where: { accountId: { in: accountIds }, date: { gte: today } },
        _sum: { instaViews: true, fbViews: true },
      }),
    ]);

    const totalsMap = new Map(
      totalsAgg.map((t) => [
        t.accountId,
        { insta: t._sum.instaViews || 0, fb: t._sum.fbViews || 0 },
      ])
    );
    const todayMap = new Map(
      todayAgg.map((t) => [
        t.accountId,
        { insta: t._sum.instaViews || 0, fb: t._sum.fbViews || 0 },
      ])
    );

    const accountsWithViews = accounts.map((account) => {
      const tot = totalsMap.get(account.id) || { insta: 0, fb: 0 };
      const tod = todayMap.get(account.id) || { insta: 0, fb: 0 };
      return {
        ...account,
        totalInstaViews: tot.insta,
        totalFbViews: tot.fb,
        totalViews: tot.insta + tot.fb,
        viewsToday: tod.insta + tod.fb,
        instaViewsToday: tod.insta,
        fbViewsToday: tod.fb,
      };
    });

    return NextResponse.json({
      accounts: accountsWithViews,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error("Accounts fetch error:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch accounts",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
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
