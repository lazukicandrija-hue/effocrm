// Idempotent schema safety-net, runs on every deploy via docker-entrypoint.sh.
//
// Why this exists: the deploy relies on `prisma db push` to create tables, but
// that step swallows errors in the standalone runner. If it ever fails silently,
// newly-added tables won't exist and writes 500. This script guarantees the
// Marketing `Inspiration` table exists using the QUERY engine (the same path the
// app already uses in production), so it works even when `db push` doesn't.
//
// Everything here is idempotent (IF NOT EXISTS / guarded DO blocks), so it's a
// no-op once the table is present.

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const statements = [
  [
    "InspirationStatus enum",
    `DO $$ BEGIN
       CREATE TYPE "InspirationStatus" AS ENUM ('IDEA', 'RECREATING', 'DONE');
     EXCEPTION WHEN duplicate_object THEN null;
     END $$;`,
  ],
  [
    "InspirationStatus ISSUE value",
    `ALTER TYPE "InspirationStatus" ADD VALUE IF NOT EXISTS 'ISSUE';`,
  ],
  [
    "Inspiration table",
    `CREATE TABLE IF NOT EXISTS "Inspiration" (
       "id" TEXT NOT NULL,
       "url" TEXT NOT NULL,
       "platform" TEXT,
       "creator" TEXT,
       "title" TEXT,
       "thumbnailUrl" TEXT,
       "niche" TEXT[] DEFAULT ARRAY[]::TEXT[],
       "notes" TEXT,
       "issueNote" TEXT,
       "addedBy" TEXT,
       "status" "InspirationStatus" NOT NULL DEFAULT 'IDEA',
       "modelId" TEXT,
       "position" INTEGER NOT NULL DEFAULT 0,
       "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
       "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
       CONSTRAINT "Inspiration_pkey" PRIMARY KEY ("id")
     );`,
  ],
  [
    "Inspiration.issueNote column",
    `ALTER TABLE "Inspiration" ADD COLUMN IF NOT EXISTS "issueNote" TEXT;`,
  ],
  [
    "Inspiration.addedBy column",
    `ALTER TABLE "Inspiration" ADD COLUMN IF NOT EXISTS "addedBy" TEXT;`,
  ],
  [
    "Inspiration_modelId_idx",
    `CREATE INDEX IF NOT EXISTS "Inspiration_modelId_idx" ON "Inspiration"("modelId");`,
  ],
  [
    "Inspiration_status_idx",
    `CREATE INDEX IF NOT EXISTS "Inspiration_status_idx" ON "Inspiration"("status");`,
  ],
  [
    "Inspiration_position_idx",
    `CREATE INDEX IF NOT EXISTS "Inspiration_position_idx" ON "Inspiration"("position");`,
  ],
  [
    "Inspiration_modelId_fkey",
    `DO $$ BEGIN
       ALTER TABLE "Inspiration"
         ADD CONSTRAINT "Inspiration_modelId_fkey"
         FOREIGN KEY ("modelId") REFERENCES "Model"("id")
         ON DELETE SET NULL ON UPDATE CASCADE;
     EXCEPTION WHEN duplicate_object THEN null;
     END $$;`,
  ],
  [
    "BadOutput table",
    `CREATE TABLE IF NOT EXISTS "BadOutput" (
       "id" TEXT NOT NULL,
       "videoKey" TEXT NOT NULL,
       "aiUsed" TEXT,
       "niche" TEXT[] DEFAULT ARRAY[]::TEXT[],
       "issue" TEXT,
       "reason" TEXT,
       "notes" TEXT,
       "addedBy" TEXT,
       "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
       "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
       CONSTRAINT "BadOutput_pkey" PRIMARY KEY ("id")
     );`,
  ],
  [
    "BadOutput_createdAt_idx",
    `CREATE INDEX IF NOT EXISTS "BadOutput_createdAt_idx" ON "BadOutput"("createdAt");`,
  ],
  [
    "Recreation table",
    `CREATE TABLE IF NOT EXISTS "Recreation" (
       "id" TEXT NOT NULL,
       "sourceUrl" TEXT NOT NULL,
       "prompt" TEXT NOT NULL,
       "status" TEXT NOT NULL DEFAULT 'QUEUED',
       "stage" TEXT,
       "frameKey" TEXT,
       "reelKey" TEXT,
       "imageRecordId" TEXT,
       "poppyImageUrl" TEXT,
       "motionRecordId" TEXT,
       "finalVideoUrl" TEXT,
       "error" TEXT,
       "addedBy" TEXT,
       "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
       "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
       CONSTRAINT "Recreation_pkey" PRIMARY KEY ("id")
     );`,
  ],
  [
    "Recreation_status_idx",
    `CREATE INDEX IF NOT EXISTS "Recreation_status_idx" ON "Recreation"("status");`,
  ],
  [
    "Recreation_createdAt_idx",
    `CREATE INDEX IF NOT EXISTS "Recreation_createdAt_idx" ON "Recreation"("createdAt");`,
  ],
  [
    "Recreation.finalKey",
    `ALTER TABLE "Recreation" ADD COLUMN IF NOT EXISTS "finalKey" TEXT;`,
  ],
  [
    "Recreation.driveUrl",
    `ALTER TABLE "Recreation" ADD COLUMN IF NOT EXISTS "driveUrl" TEXT;`,
  ],
  [
    "Recreation.driveError",
    `ALTER TABLE "Recreation" ADD COLUMN IF NOT EXISTS "driveError" TEXT;`,
  ],
  [
    "DriveAuth table",
    `CREATE TABLE IF NOT EXISTS "DriveAuth" (
       "id" TEXT NOT NULL,
       "refreshToken" TEXT NOT NULL,
       "email" TEXT,
       "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
       CONSTRAINT "DriveAuth_pkey" PRIMARY KEY ("id")
     );`,
  ],
  [
    "DeletedAccount table",
    `CREATE TABLE IF NOT EXISTS "DeletedAccount" (
       "id" TEXT NOT NULL,
       "igUsername" TEXT,
       "username" TEXT,
       "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
       CONSTRAINT "DeletedAccount_pkey" PRIMARY KEY ("id")
     );`,
  ],
  [
    "DeletedAccount_igUsername_idx",
    `CREATE INDEX IF NOT EXISTS "DeletedAccount_igUsername_idx" ON "DeletedAccount"("igUsername");`,
  ],
  [
    "ScraperControl table",
    `CREATE TABLE IF NOT EXISTS "ScraperControl" (
       "id" TEXT NOT NULL,
       "refreshRequestedAt" TIMESTAMP(3),
       "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
       CONSTRAINT "ScraperControl_pkey" PRIMARY KEY ("id")
     );`,
  ],
];

async function main() {
  for (const [label, sql] of statements) {
    try {
      await prisma.$executeRawUnsafe(sql);
      console.log(`✅ ensured: ${label}`);
    } catch (e) {
      console.error(`⚠️  ensure ${label} failed: ${e.message}`);
    }
  }
  console.log("🎉 Inspiration schema ensured");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error("❌ ensure-schema error:", e);
    await prisma.$disconnect();
    // Do not hard-fail the container start
  });
