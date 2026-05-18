# Effortless MGMT — CRM Dashboard

Instagram account management platform for the Effortless MGMT agency. Track reels views (Instagram & Facebook), manage accounts across niches, and monitor performance.

## Tech Stack

- **Frontend:** Next.js 14 (App Router) + Tailwind CSS + shadcn/ui
- **Backend:** Next.js API Routes + Prisma ORM
- **Database:** PostgreSQL
- **Auth:** NextAuth.js (credentials provider, JWT sessions)
- **Charts:** Recharts
- **Deployment:** Docker + docker-compose → Coolify → DigitalOcean

---

## Local Development

### Prerequisites
- Node.js 20+
- Docker (for PostgreSQL)

### Setup

```bash
# 1. Install dependencies
npm install

# 2. Start PostgreSQL via Docker
docker-compose up db -d

# 3. Run database migrations
npx prisma migrate dev

# 4. Seed the database with sample data
npm run db:seed

# 5. Start the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### Default Admin Credentials
- **Email:** `admin@effortless.com`
- **Password:** `admin123`

---

## Production Deployment (Coolify + DigitalOcean)

### Option 1: Docker Compose (Recommended)

```bash
# 1. Push to GitHub
git init && git add . && git commit -m "Initial commit"
git remote add origin <your-github-repo-url>
git push -u origin main

# 2. In Coolify:
#    - Create new service → Docker Compose
#    - Connect your GitHub repo
#    - Set environment variables (see below)
#    - Deploy
```

### Option 2: Dockerfile Only

If you have an external PostgreSQL database:

```bash
# In Coolify:
#    - Create new service → Dockerfile
#    - Set DATABASE_URL to your external PostgreSQL
#    - Set NEXTAUTH_SECRET and NEXTAUTH_URL
#    - Deploy
```

### After First Deploy

```bash
# SSH into your server or use Coolify terminal
# Run migrations and seed:
npx prisma migrate deploy
npx tsx prisma/seed.ts
```

---

## Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@db:5432/effortless_crm` |
| `NEXTAUTH_SECRET` | Random secret for JWT signing | `openssl rand -base64 32` |
| `NEXTAUTH_URL` | Your app's public URL | `https://crm.effortlessmgmt.com` |

---

## Project Structure

```
src/
├── app/
│   ├── api/           # API routes (accounts, models, stats, users)
│   ├── login/         # Login page
│   ├── dashboard/     # Dashboard with charts
│   ├── accounts/      # Account management table
│   ├── add-views/     # Single + bulk view entry
│   ├── models/        # Model management
│   ├── team/          # Team member management
│   └── settings/      # Password change + CSV export
├── components/
│   ├── layout/        # Sidebar + DashboardLayout
│   ├── providers/     # AuthProvider
│   └── ui/            # shadcn/ui components
├── lib/
│   ├── auth.ts        # NextAuth configuration
│   ├── prisma.ts      # Prisma client singleton
│   └── utils.ts       # Utility functions
└── types/             # TypeScript type extensions
```

---

## Features

- 📊 **Dashboard** — Views over time, status distribution, niche breakdown
- 📱 **Accounts** — Full CRUD with search, filter, sort, pagination
- 👁️ **Add Views** — Single entry + bulk CSV import (Instagram & Facebook separately)
- 👤 **Models** — Model cards with aggregated stats
- 👥 **Team** — User management with role assignment
- ⚙️ **Settings** — Password change + CSV export
- 🔒 **Auth** — JWT sessions, all routes protected
- 🐳 **Docker** — Multi-stage build, docker-compose with persistent storage

---

## Database Schema

- **User** — Team members (ADMIN / MEMBER roles)
- **Model** — OnlyFans models (e.g., Poppy)
- **Account** — Instagram accounts with niche + status
- **DailyStat** — Daily views (Instagram + Facebook) and follower counts

---

## License

Private — Effortless MGMT © 2024
