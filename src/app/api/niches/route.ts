// API: user-managed niche list. GET lists them (seeding defaults + niches already
// in use on the very first call), POST adds one, DELETE removes one. Deletions stick
// (we only seed when the table is completely empty), so removed niches don't return.
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

const DEFAULT_NICHES = [
  "Cashier",
  "McDonald's",
  "Starbucks",
  "Chipotle",
  "Waitress",
  "Delivery Girl",
  "Mechanic",
  "Golf",
  "Talking",
  "Motion Control",
];

async function list(): Promise<string[]> {
  const rows = await prisma.niche.findMany({ orderBy: { createdAt: "asc" } });
  return rows.map((r) => r.name);
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let niches = await list();
  if (niches.length === 0) {
    // First run only: seed defaults + whatever niches accounts already carry.
    const accts = await prisma.account.findMany({ select: { niche: true } }).catch(() => [] as { niche: string[] }[]);
    const set = new Set<string>(DEFAULT_NICHES);
    for (const a of accts) for (const n of a.niche || []) if (n?.trim()) set.add(n.trim());
    await prisma.niche
      .createMany({ data: Array.from(set).map((name) => ({ name })), skipDuplicates: true })
      .catch(() => {});
    niches = await list();
  }
  return NextResponse.json({ niches });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({} as any));
  const name = String(body.name || "").trim().slice(0, 60);
  if (!name) return NextResponse.json({ error: "Name required." }, { status: 400 });
  await prisma.niche.upsert({ where: { name }, create: { name }, update: {} }).catch(() => {});
  return NextResponse.json({ niches: await list() });
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({} as any));
  const name = String(body.name || "").trim();
  if (!name) return NextResponse.json({ error: "Name required." }, { status: 400 });
  await prisma.niche.deleteMany({ where: { name } }).catch(() => {});
  return NextResponse.json({ niches: await list() });
}
