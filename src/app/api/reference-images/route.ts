// API: Reference Images library — list (with fresh signed URLs) + create.
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { presignGet } from "@/lib/spaces";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rows = await prisma.referenceImage.findMany({ orderBy: { createdAt: "desc" }, take: 500 });
  const items = await Promise.all(
    rows.map(async (r) => ({
      id: r.id,
      niche: r.niche,
      label: r.label,
      addedBy: r.addedBy,
      createdAt: r.createdAt,
      url: await presignGet(r.imageKey, 6 * 24 * 3600).catch(() => null),
    }))
  );
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({} as any));
  const imageKey = String(body.imageKey || "").trim();
  const niche = String(body.niche || "").trim();
  if (!imageKey || !niche) {
    return NextResponse.json({ error: "Pick a folder and upload an image." }, { status: 400 });
  }
  const created = await prisma.referenceImage.create({
    data: {
      imageKey,
      niche,
      label: body.label ? String(body.label).slice(0, 120) : null,
      addedBy: body.addedBy ? String(body.addedBy).slice(0, 60) : null,
    },
  });
  return NextResponse.json({ id: created.id }, { status: 201 });
}
