import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export async function POST(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get("key");
    
    if (key !== "effortless-seed-2026") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Step 1: Run migrations
    let migrationResult = "skipped";
    try {
      const { stdout, stderr } = await execAsync("npx prisma migrate deploy", {
        timeout: 30000,
        env: process.env as any,
      });
      migrationResult = stdout || "success";
    } catch (migErr: any) {
      // If npx isn't available, try direct prisma binary
      try {
        const { stdout } = await execAsync("./node_modules/.bin/prisma migrate deploy", {
          timeout: 30000,
          env: process.env as any,
        });
        migrationResult = stdout || "success via bin";
      } catch {
        migrationResult = `failed: ${migErr.message}`;
      }
    }

    // Step 2: Try to create tables via Prisma push as fallback
    const prisma = new PrismaClient();
    
    // Check if tables exist
    let tablesExist = true;
    try {
      await prisma.user.findFirst();
    } catch {
      tablesExist = false;
      // Tables don't exist - try raw SQL to create them
      try {
        await prisma.$executeRawUnsafe(`
          CREATE TABLE IF NOT EXISTS "User" (
            "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
            "email" TEXT NOT NULL,
            "password" TEXT NOT NULL,
            "name" TEXT NOT NULL DEFAULT 'User',
            "role" TEXT NOT NULL DEFAULT 'MEMBER',
            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT "User_pkey" PRIMARY KEY ("id")
          );
          CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");
          
          CREATE TABLE IF NOT EXISTS "Model" (
            "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
            "name" TEXT NOT NULL,
            "photo" TEXT,
            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT "Model_pkey" PRIMARY KEY ("id")
          );
          
          CREATE TABLE IF NOT EXISTS "Account" (
            "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
            "username" TEXT NOT NULL,
            "modelId" TEXT NOT NULL,
            "niche" TEXT NOT NULL DEFAULT 'GOLF',
            "status" TEXT NOT NULL DEFAULT 'ACTIVE',
            "dateCreated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "dateBanned" TIMESTAMP(3),
            "followers" INTEGER NOT NULL DEFAULT 0,
            "notes" TEXT,
            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
          );
          CREATE UNIQUE INDEX IF NOT EXISTS "Account_username_key" ON "Account"("username");
          
          CREATE TABLE IF NOT EXISTS "DailyStat" (
            "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
            "accountId" TEXT NOT NULL,
            "date" TIMESTAMP(3) NOT NULL,
            "instaViews" INTEGER NOT NULL DEFAULT 0,
            "fbViews" INTEGER NOT NULL DEFAULT 0,
            "followers" INTEGER NOT NULL DEFAULT 0,
            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT "DailyStat_pkey" PRIMARY KEY ("id")
          );
          CREATE UNIQUE INDEX IF NOT EXISTS "DailyStat_accountId_date_key" ON "DailyStat"("accountId", "date");
          
          ALTER TABLE "Account" ADD CONSTRAINT "Account_modelId_fkey" 
            FOREIGN KEY ("modelId") REFERENCES "Model"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
          ALTER TABLE "DailyStat" ADD CONSTRAINT "DailyStat_accountId_fkey" 
            FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
        `);
        tablesExist = true;
      } catch (sqlErr: any) {
        // Foreign keys may already exist, that's fine
        if (sqlErr.message?.includes("already exists")) {
          tablesExist = true;
        } else {
          await prisma.$disconnect();
          return NextResponse.json({ error: "Failed to create tables", details: sqlErr.message }, { status: 500 });
        }
      }
    }

    // Step 3: Check if already seeded
    const existingUser = await prisma.user.findFirst();
    if (existingUser) {
      await prisma.$disconnect();
      return NextResponse.json({ message: "Database already seeded", seeded: false, migration: migrationResult });
    }

    // Step 4: Create admin users
    const hashedPassword = await hash("admin123", 12);
    const admin = await prisma.user.create({
      data: { email: "admin@effortless.com", password: hashedPassword, name: "Admin", role: "ADMIN" },
    });

    const hashedPassword2 = await hash("admin2026", 12);
    await prisma.user.create({
      data: { email: "admin", password: hashedPassword2, name: "Admin", role: "ADMIN" },
    });

    // Step 5: Create model
    const poppy = await prisma.model.create({ data: { name: "Poppy" } });

    // Step 6: Create accounts
    const accountsData = [
      { username: "@poppy.golf", niche: "GOLF" as const, status: "ACTIVE" as const, followers: 12500 },
      { username: "@poppy.casual", niche: "CASUAL" as const, status: "ACTIVE" as const, followers: 8200 },
      { username: "@poppy.talks", niche: "TALKING_HEAD" as const, status: "WARNING" as const, followers: 15300 },
      { username: "@poppy.dance", niche: "DANCING" as const, status: "ACTIVE" as const, followers: 22100 },
      { username: "@poppy.golf2", niche: "GOLF" as const, status: "ACTIVE" as const, followers: 5400 },
    ];

    const accounts: any[] = [];
    for (const acc of accountsData) {
      const account = await prisma.account.create({
        data: { ...acc, modelId: poppy.id, dateCreated: new Date() },
      });
      accounts.push(account);
    }

    // Step 7: Generate 30 days of stats
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

    await prisma.$disconnect();

    return NextResponse.json({
      message: "Database seeded successfully!",
      seeded: true,
      migration: migrationResult,
      admins: ["admin@effortless.com", "admin"],
      model: poppy.name,
      accounts: accounts.length,
      stats: accounts.length * 30,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message, stack: error.stack?.split("\n").slice(0, 5) }, { status: 500 });
  }
}
