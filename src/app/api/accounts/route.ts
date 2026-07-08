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

    // Whitelist sortable fields so a bad ?sortBy never 500s. viewsToday and
    // totalViews are aggregated (not columns), so they're sorted in memory.
    const COMPUTED = new Set(["viewsToday", "totalViews"]);
    const REAL = new Set([
      "position", "username", "followers", "status", "decision",
      "hasFacebook", "linkInBio", "lastPost", "accountCreatedDate", "dateCreated",
    ]);
    const sortField = COMPUTED.has(sortBy) || REAL.has(sortBy) ? sortBy : "position";
    const dir = sortOrder === "asc" ? "asc" : "desc";

    const include: any = {
      model: { select: { name: true } },
      dailyStats: { orderBy: { date: "desc" }, take: 1 },
    };

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Attach aggregated view counts (all-time + today) to a set of accounts using
    // two groupBy queries — never N+1.
    const attachViews = async (accts: any[]) => {
      const ids = accts.map((a) => a.id);
      const [totalsAgg, todayAgg] = await Promise.all([
        prisma.dailyStat.groupBy({
          by: ["accountId"],
          where: { accountId: { in: ids } },
          _sum: { instaViews: true, fbViews: true },
        }),
        prisma.dailyStat.groupBy({
          by: ["accountId"],
          where: { accountId: { in: ids }, date: { gte: today } },
          _sum: { instaViews: true, fbViews: true },
        }),
      ]);
      const totalsMap = new Map(
        totalsAgg.map((t) => [t.accountId, { insta: t._sum.instaViews || 0, fb: t._sum.fbViews || 0 }])
      );
      const todayMap = new Map(
        todayAgg.map((t) => [t.accountId, { insta: t._sum.instaViews || 0, fb: t._sum.fbViews || 0 }])
      );
      return accts.map((account) => {
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
    };

    if (COMPUTED.has(sortField)) {
      // Sorting by an aggregated metric: compute for ALL matching accounts, sort,
      // then paginate in memory (account counts are small).
      const all = await prisma.account.findMany({ where, include });
      const withViews = await attachViews(all);
      withViews.sort((a: any, b: any) =>
        dir === "asc" ? a[sortField] - b[sortField] : b[sortField] - a[sortField]
      );
      const start = (page - 1) * limit;
      return NextResponse.json({
        accounts: withViews.slice(start, start + limit),
        total: withViews.length,
        page,
        totalPages: Math.ceil(withViews.length / limit),
      });
    }

    // Real column: let the DB sort + paginate, then aggregate just the page.
    const [accounts, total] = await Promise.all([
      prisma.account.findMany({
        where,
        include,
        orderBy: { [sortField]: dir },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.account.count({ where }),
    ]);
    const accountsWithViews = await attachViews(accounts);

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
