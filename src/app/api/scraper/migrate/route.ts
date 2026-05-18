// API: Force database schema sync - one-time use for managed DB
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

const SCRAPER_SECRET = process.env.SCRAPER_SECRET || "effortless-scraper-2026";

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${SCRAPER_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const results: string[] = [];

    // Add igUsername column to Account if missing
    try {
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "Account" ADD COLUMN IF NOT EXISTS "igUsername" TEXT;
      `);
      results.push("Added igUsername to Account");
    } catch (e: any) { results.push(`igUsername: ${e.message}`); }

    try {
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "Account" ADD COLUMN IF NOT EXISTS "lastSyncedAt" TIMESTAMP(3);
      `);
      results.push("Added lastSyncedAt to Account");
    } catch (e: any) { results.push(`lastSyncedAt: ${e.message}`); }

    // Create Reel table
    try {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "Reel" (
          "id" TEXT NOT NULL,
          "accountId" TEXT NOT NULL,
          "shortcode" TEXT NOT NULL,
          "igMediaId" TEXT,
          "thumbnailUrl" TEXT,
          "caption" TEXT,
          "publishedAt" TIMESTAMP(3),
          "currentViews" INTEGER NOT NULL DEFAULT 0,
          "currentLikes" INTEGER NOT NULL DEFAULT 0,
          "currentComments" INTEGER NOT NULL DEFAULT 0,
          "lastScrapedAt" TIMESTAMP(3),
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "Reel_pkey" PRIMARY KEY ("id"),
          CONSTRAINT "Reel_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE
        );
      `);
      results.push("Created Reel table");
    } catch (e: any) { results.push(`Reel: ${e.message}`); }

    try {
      await prisma.$executeRawUnsafe(`
        CREATE UNIQUE INDEX IF NOT EXISTS "Reel_accountId_shortcode_key" ON "Reel"("accountId", "shortcode");
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "Reel_accountId_idx" ON "Reel"("accountId");
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "Reel_shortcode_idx" ON "Reel"("shortcode");
      `);
      results.push("Created Reel indexes");
    } catch (e: any) { results.push(`Reel indexes: ${e.message}`); }

    // Create ReelSnapshot table
    try {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "ReelSnapshot" (
          "id" TEXT NOT NULL,
          "reelId" TEXT NOT NULL,
          "views" INTEGER NOT NULL DEFAULT 0,
          "likes" INTEGER NOT NULL DEFAULT 0,
          "comments" INTEGER NOT NULL DEFAULT 0,
          "scrapedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "ReelSnapshot_pkey" PRIMARY KEY ("id"),
          CONSTRAINT "ReelSnapshot_reelId_fkey" FOREIGN KEY ("reelId") REFERENCES "Reel"("id") ON DELETE CASCADE ON UPDATE CASCADE
        );
      `);
      results.push("Created ReelSnapshot table");
    } catch (e: any) { results.push(`ReelSnapshot: ${e.message}`); }

    try {
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "ReelSnapshot_reelId_idx" ON "ReelSnapshot"("reelId");
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "ReelSnapshot_scrapedAt_idx" ON "ReelSnapshot"("scrapedAt");
      `);
      results.push("Created ReelSnapshot indexes");
    } catch (e: any) { results.push(`ReelSnapshot indexes: ${e.message}`); }

    // Create AccountSnapshot table
    try {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "AccountSnapshot" (
          "id" TEXT NOT NULL,
          "accountId" TEXT NOT NULL,
          "followers" INTEGER NOT NULL DEFAULT 0,
          "following" INTEGER NOT NULL DEFAULT 0,
          "postsCount" INTEGER NOT NULL DEFAULT 0,
          "scrapedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "AccountSnapshot_pkey" PRIMARY KEY ("id"),
          CONSTRAINT "AccountSnapshot_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE
        );
      `);
      results.push("Created AccountSnapshot table");
    } catch (e: any) { results.push(`AccountSnapshot: ${e.message}`); }

    try {
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "AccountSnapshot_accountId_idx" ON "AccountSnapshot"("accountId");
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "AccountSnapshot_scrapedAt_idx" ON "AccountSnapshot"("scrapedAt");
      `);
      results.push("Created AccountSnapshot indexes");
    } catch (e: any) { results.push(`AccountSnapshot indexes: ${e.message}`); }

    // Create ScraperConfig table
    try {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "ScraperConfig" (
          "id" TEXT NOT NULL,
          "igUsername" TEXT NOT NULL,
          "igPassword" TEXT NOT NULL,
          "sessionData" TEXT,
          "lastLoginAt" TIMESTAMP(3),
          "isActive" BOOLEAN NOT NULL DEFAULT true,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "ScraperConfig_pkey" PRIMARY KEY ("id")
        );
      `);
      await prisma.$executeRawUnsafe(`
        CREATE UNIQUE INDEX IF NOT EXISTS "ScraperConfig_igUsername_key" ON "ScraperConfig"("igUsername");
      `);
      results.push("Created ScraperConfig table");
    } catch (e: any) { results.push(`ScraperConfig: ${e.message}`); }

    // Add index on Account.igUsername
    try {
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "Account_igUsername_idx" ON "Account"("igUsername");
      `);
      results.push("Created Account.igUsername index");
    } catch (e: any) { results.push(`Account index: ${e.message}`); }

    return NextResponse.json({ success: true, results });
  } catch (error) {
    console.error("Migration error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
