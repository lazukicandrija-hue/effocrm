// API: Link IG usernames to existing CRM accounts & setup initial data
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

const SCRAPER_SECRET = process.env.SCRAPER_SECRET || "effortless-scraper-2026";

// POST - Link IG usernames to accounts or create new ones
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${SCRAPER_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { links } = body;
    // links: [{ crmUsername: "poppy.golf", igUsername: "brooxpoppy" }]
    // OR: [{ igUsername: "brooxpoppy", niche: "GOLF", modelName: "Poppy" }] for auto-create

    if (!links || !Array.isArray(links)) {
      return NextResponse.json({ error: "Expected { links: [...] }" }, { status: 400 });
    }

    const results = [];

    for (const link of links) {
      const { crmUsername, igUsername, niche, modelName } = link;

      if (!igUsername) continue;

      // Try to find existing account by CRM username
      let account = crmUsername
        ? await prisma.account.findUnique({ where: { username: crmUsername } })
        : null;

      // Or try to find by igUsername already set
      if (!account) {
        account = await prisma.account.findFirst({
          where: { igUsername: igUsername.toLowerCase() },
        });
      }

      if (account) {
        // Update existing account
        await prisma.account.update({
          where: { id: account.id },
          data: { igUsername: igUsername.toLowerCase() },
        });
        results.push({ igUsername, status: "linked", accountId: account.id });
      } else {
        // Create new account with this igUsername
        // Find or create model
        let model = modelName
          ? await prisma.model.findFirst({ where: { name: modelName } })
          : await prisma.model.findFirst();

        if (!model) {
          model = await prisma.model.create({
            data: { name: modelName || "Default" },
          });
        }

        const newAccount = await prisma.account.create({
          data: {
            username: igUsername.toLowerCase(),
            igUsername: igUsername.toLowerCase(),
            modelId: model.id,
            niche: (niche as any) || "CASUAL",
            status: "ACTIVE",
          },
        });
        results.push({ igUsername, status: "created", accountId: newAccount.id });
      }
    }

    return NextResponse.json({ success: true, results });
  } catch (error) {
    console.error("Link accounts error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
