// API: track competitor IG accounts (scanned by the scraper + fed to the idea engine,
// just like your own accounts — they need no Model and are flagged COMPETITOR).
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

// Accept a profile link, @handle, or plain handle → the bare lowercase username.
function normalizeHandle(input: string): string {
  let s = String(input || "").trim();
  const m = s.match(/instagram\.com\/([^/?#]+)/i);
  if (m) s = m[1];
  return s.replace(/^@/, "").replace(/\/+$/, "").trim().toLowerCase();
}

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
      niche: true,
      lastSyncedAt: true,
      _count: { select: { reels: true } },
    },
  });
  return NextResponse.json({ competitors });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const handle = normalizeHandle(body.igUsername || body.url || "");
  if (!handle) return NextResponse.json({ error: "Instagram username or link required." }, { status: 400 });
  const niche: string[] = Array.isArray(body.niche)
    ? body.niche.filter((n: any) => typeof n === "string" && n.trim()).map((n: string) => n.trim())
    : [];

  // username is unique — upsert so re-adding just (re)flags it COMPETITOR.
  // Only overwrite niche when some is provided, so re-adding never wipes it.
  const account = await prisma.account.upsert({
    where: { username: handle },
    update: { ownership: "COMPETITOR", igUsername: handle, ...(niche.length ? { niche } : {}) },
    create: { username: handle, igUsername: handle, ownership: "COMPETITOR", niche },
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
