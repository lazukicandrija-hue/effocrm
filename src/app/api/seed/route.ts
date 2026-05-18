import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();

export async function POST(request: Request) {
  try {
    // Check for a secret key to prevent unauthorized seeding
    const { searchParams } = new URL(request.url);
    const key = searchParams.get("key");
    
    if (key !== "effortless-seed-2026") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if already seeded
    const existingUser = await prisma.user.findFirst();
    if (existingUser) {
      return NextResponse.json({ message: "Database already seeded", seeded: false });
    }

    // Create admin users
    const hashedPassword = await hash("admin123", 12);
    const admin = await prisma.user.create({
      data: {
        email: "admin@effortless.com",
        password: hashedPassword,
        name: "Admin",
        role: "ADMIN",
      },
    });

    const hashedPassword2 = await hash("admin2026", 12);
    const admin2 = await prisma.user.create({
      data: {
        email: "admin",
        password: hashedPassword2,
        name: "Admin",
        role: "ADMIN",
      },
    });

    // Create model
    const poppy = await prisma.model.create({
      data: { name: "Poppy" },
    });

    // Create accounts
    const accountsData = [
      { username: "@poppy.golf", niche: "GOLF" as const, status: "ACTIVE" as const, followers: 12500 },
      { username: "@poppy.casual", niche: "CASUAL" as const, status: "ACTIVE" as const, followers: 8200 },
      { username: "@poppy.talks", niche: "TALKING_HEAD" as const, status: "WARNING" as const, followers: 15300 },
      { username: "@poppy.dance", niche: "DANCING" as const, status: "ACTIVE" as const, followers: 22100 },
      { username: "@poppy.golf2", niche: "GOLF" as const, status: "ACTIVE" as const, followers: 5400 },
    ];

    const accounts = [];
    for (const acc of accountsData) {
      const account = await prisma.account.create({
        data: {
          username: acc.username,
          modelId: poppy.id,
          niche: acc.niche,
          status: acc.status,
          followers: acc.followers,
          dateCreated: new Date(),
        },
      });
      accounts.push(account);
    }

    // Generate 30 days of stats
    for (const account of accounts) {
      for (let i = 29; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        date.setHours(0, 0, 0, 0);
        
        await prisma.dailyStat.create({
          data: {
            accountId: account.id,
            date,
            instaViews: Math.floor(Math.random() * 15000) + 1000,
            fbViews: Math.floor(Math.random() * 8000) + 500,
            followers: Math.floor(Math.random() * 200) + 10,
          },
        });
      }
    }

    return NextResponse.json({
      message: "Database seeded successfully!",
      seeded: true,
      admin: admin.email,
      model: poppy.name,
      accounts: accounts.length,
      stats: accounts.length * 30,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
