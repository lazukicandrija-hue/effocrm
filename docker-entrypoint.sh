#!/bin/sh
set -e

echo "🚀 Starting Effortless CRM..."

# Run database migrations
echo "📦 Running database migrations..."
npx prisma migrate deploy 2>/dev/null || echo "⚠️  Migrations skipped (will run on first setup)"

echo "✅ Ready!"

# Execute the main command
exec "$@"
