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
       "status" "InspirationStatus" NOT NULL DEFAULT 'IDEA',
       "modelId" TEXT,
       "position" INTEGER NOT NULL DEFAULT 0,
       "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
       "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
       CONSTRAINT "Inspiration_pkey" PRIMARY KEY ("id")
     );`,
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
