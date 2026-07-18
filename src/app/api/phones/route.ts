// API: Phones — list (each with its accounts) + create. Phones track which
// physical iPhone each Instagram account lives on.
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

const accountSelect = {
  id: true,
  username: true,
  igUsername: true,
  status: true,
  niche: true,
  followers: true,
} as const;

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const phones = await prisma.phone.findMany({
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    include: {
      accounts: {
        where: { ownership: "OWN" },
        select: accountSelect,
        orderBy: { username: "asc" },
      },
    },
  });
  // Our accounts not yet assigned to any phone — shown so nothing is lost.
  const unassigned = await prisma.account.findMany({
    where: { phoneId: null, ownership: "OWN" },
    select: accountSelect,
    orderBy: { username: "asc" },
  });
  return NextResponse.json({ phones, unassigned });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({} as any));
  const name = String(body.name || "").trim();
  if (!name) return NextResponse.json({ error: "Phone name is required" }, { status: 400 });

  const count = await prisma.phone.count();
  const phone = await prisma.phone.create({
    data: { name, notes: body.notes ? String(body.notes) : null, position: count },
  });
  return NextResponse.json(phone, { status: 201 });
}
