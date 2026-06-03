#!/bin/sh
set -e

echo "🚀 Starting Effortless CRM..."

# Run database schema push (creates tables if they don't exist)
echo "📦 Syncing database schema..."
# Use the prisma CLI directly — `npx prisma` is not resolvable in the standalone runner image
node node_modules/prisma/build/index.js db push --skip-generate --accept-data-loss 2>&1 || echo "⚠️  Schema sync skipped"

# Safety-net: guarantee the Marketing "Inspiration" table exists even if the
# db push above silently failed. Uses the query engine (always works in the
# standalone runner) and is fully idempotent.
echo "🧩 Ensuring marketing schema..."
node prisma/ensure-schema.js 2>&1 || echo "⚠️  Schema ensure skipped"

# Seed/refresh the KEEP accounts (idempotent — preserves scraped data)
echo "🌱 Seeding KEEP accounts..."
node prisma/seed-keep.js 2>&1 || echo "⚠️  KEEP seed skipped"

echo "✅ Ready!"

# Execute the main command
exec "$@"
