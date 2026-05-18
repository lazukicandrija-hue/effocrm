#!/bin/sh
set -e

echo "🚀 Starting Effortless CRM..."

# Run database schema push (creates tables if they don't exist)
echo "📦 Syncing database schema..."
npx prisma db push --skip-generate 2>&1 || echo "⚠️  Schema sync skipped"

echo "✅ Ready!"

# Execute the main command
exec "$@"
