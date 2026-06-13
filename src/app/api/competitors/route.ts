// API: track competitor IG accounts (scanned by the scraper + fed to the idea engine,
// just like your own accounts — they need no Model and are flagged COMPETITOR).
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const competitors = await prisma.account.findMany({
    where: { ownership: "COMPETITOR" },
    orderBy: [{ followers: "desc" }],
    select: {
      id: true,
      username: true,
      igUsername: true,
      followers: true,
      lastSyncedAt: true,
      _count: { select: { reels: true } },
    },
  });
  return NextResponse.json({ competitors });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { igUsername } = await req.json().catch(() => ({}));
  const handle = String(igUsername || "").replace(/^@/, "").trim().toLowerCase();
  if (!handle) return NextResponse.json({ error: "Instagram username required." }, { status: 400 });

  // username is unique — upsert so re-adding just flags it COMPETITOR.
  const account = await prisma.account.upsert({
    where: { username: handle },
    update: { ownership: "COMPETITOR", igUsername: handle },
    create: { username: handle, igUsername: handle, ownership: "COMPETITOR" },
  });
  return NextResponse.json({ account });
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await req.json().catch(() => ({}));
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await prisma.account.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
