// Idempotent seed for the 11 "KEEP" accounts migrated from Airtable.
// Runs on every deploy via docker-entrypoint.sh.
// - Creates accounts that don't exist yet.
// - Updates niche/decision/notes/profileUrl/model on existing ones.
// - Never overwrites scraped data (followers, reels) or the `login` field.
// Run with: node prisma/seed-keep.js

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const KEEP_ACCOUNTS = [
  { username: "poppybruuks", niche: [], notes: "SOCCER NICHE / NEED TO REBRAND" },
  { username: "poppybroocks", niche: ["Golf"], notes: "2nd best golf" },
  { username: "brooxpoppy", niche: ["Golf"], notes: "MAIN GOLF" },
  { username: "iampoppyb", niche: ["Omegle"], notes: "Omegle 1st acc" },
  { username: "xpoppybrooks", niche: ["Golf"], notes: "Golf 3rd acc" },
  { username: "poppybroo", niche: ["Golf"], notes: "Prosao 1 od prva 3 reela; dobra demo / GOLF 4" },
  { username: "golfspoppy", niche: ["Golf"], notes: null },
  { username: "poppybrooksgolf", niche: ["Golf"], notes: null },
  { username: "golfpoppybrooks", niche: ["Golf"], notes: null },
  { username: "puppsgolf", niche: ["Golf"], notes: null },
  { username: "pipsyplay", niche: ["Golf"], notes: null },
];

async function main() {
  const poppy = await prisma.model.upsert({
    where: { id: "poppy-model-id" },
    update: {},
    create: { id: "poppy-model-id", name: "Poppy" },
  });

  for (const acc of KEEP_ACCOUNTS) {
    const username = acc.username.replace("@", "");
    const igUsername = username.toLowerCase();
    const profileUrl = `https://instagram.com/${username}`;

    const shared = {
      igUsername,
      niche: acc.niche,
      decision: "KEEP",
      notes: acc.notes,
      profileUrl,
      modelId: poppy.id,
    };

    await prisma.account.upsert({
      where: { username },
      // update only metadata — preserve followers/reels/login and status
      update: {
        niche: acc.niche,
        decision: "KEEP",
        notes: acc.notes,
        profileUrl,
        modelId: poppy.id,
        igUsername,
      },
      create: { username, status: "ACTIVE", ...shared },
    });
    console.log(`✅ KEEP account: @${username}`);
  }

  console.log("🎉 KEEP seed complete!");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error("❌ KEEP seed error:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
