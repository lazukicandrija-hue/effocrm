// Seed script: populates database with initial data
// Run with: npx ts-node --compiler-options '{"module":"CommonJS"}' prisma/seed.ts
// Or: npx tsx prisma/seed.ts

const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database...\n");

  // 1. Create admin user
  const hashedPassword = await bcrypt.hash("admin123", 12);
  const admin = await prisma.user.upsert({
    where: { email: "admin@effortless.com" },
    update: {},
    create: {
      email: "admin@effortless.com",
      name: "Admin",
      password: hashedPassword,
      role: "ADMIN",
    },
  });
  console.log(`✅ Admin user: ${admin.email} (password: admin123)`);

  // 1b. Create second admin user
  const hashedPassword2 = await bcrypt.hash("admin2026", 12);
  const admin2 = await prisma.user.upsert({
    where: { email: "admin" },
    update: {},
    create: {
      email: "admin",
      name: "Admin",
      password: hashedPassword2,
      role: "ADMIN",
    },
  });
  console.log(`✅ Admin user: ${admin2.email} (password: admin2026)`);

  // 2. Create model "Poppy"
  const poppy = await prisma.model.upsert({
    where: { id: "poppy-model-id" },
    update: {},
    create: {
      id: "poppy-model-id",
      name: "Poppy",
    },
  });
  console.log(`✅ Model: ${poppy.name}`);

  // 3. Create sample accounts
  const accountsData = [
    {
      username: "poppy.golf",
      niche: "GOLF",
      status: "ACTIVE",
      followers: 12500,
    },
    {
      username: "poppy.casual",
      niche: "CASUAL",
      status: "ACTIVE",
      followers: 8200,
    },
    {
      username: "poppy.talks",
      niche: "TALKING_HEAD",
      status: "ACTIVE",
      followers: 5600,
    },
    {
      username: "poppy.dance",
      niche: "DANCING",
      status: "WARNING",
      followers: 15800,
    },
    {
      username: "poppy.golf2",
      niche: "GOLF",
      status: "ACTIVE",
      followers: 3200,
    },
  ];

  const accounts = [];
  for (const data of accountsData) {
    const account = await prisma.account.upsert({
      where: { username: data.username },
      update: {},
      create: {
        ...data,
        modelId: poppy.id,
        dateCreated: new Date(
          Date.now() - Math.floor(Math.random() * 30) * 24 * 60 * 60 * 1000
        ),
      },
    });
    accounts.push(account);
    console.log(`✅ Account: @${account.username} (${data.niche})`);
  }

  // 4. Generate 30 days of random view data
  console.log("\n📊 Generating 30 days of daily stats...");
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const account of accounts) {
    for (let i = 0; i < 30; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);

      // Random views - higher for more established accounts
      const baseViews = account.followers * (Math.random() * 0.5 + 0.3);
      const instaViews = Math.floor(baseViews * (Math.random() * 0.4 + 0.6));
      const fbViews = Math.floor(baseViews * Math.random() * 0.4);
      const followersGain = Math.floor(Math.random() * 50 + 10);

      await prisma.dailyStat.upsert({
        where: {
          accountId_date: {
            accountId: account.id,
            date: date,
          },
        },
        update: {},
        create: {
          accountId: account.id,
          date: date,
          instaViews,
          fbViews,
          followers: followersGain,
        },
      });
    }
    console.log(`  📈 Stats for @${account.username}: 30 days`);
  }

  console.log("\n🎉 Seeding complete!");
  console.log("\n📋 Login credentials:");
  console.log("   Email: admin@effortless.com / Password: admin123");
  console.log("   Email: admin / Password: admin2026");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e: any) => {
    console.error("❌ Seeding error:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
