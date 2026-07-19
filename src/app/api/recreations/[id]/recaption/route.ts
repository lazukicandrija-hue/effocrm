// Re-caption an already-finished reel from its permanent Spaces copy (no re-render).
// Clears finalKey so the tick's finalize pass runs captioning again on the fixed path.
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { presignGet } from "@/lib/spaces";

const SCRAPER_SECRET = process.env.SCRAPER_SECRET || "effortless-scraper-2026";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const ok = !!session || req.headers.get("authorization") === `Bearer ${SCRAPER_SECRET}`;
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const job = await prisma.recreation.findUnique({ where: { id: params.id } });
  if (!job || job.status !== "DONE") {
    return NextResponse.json({ error: "Job not found or not done" }, { status: 400 });
  }
  // Caption from the permanent Spaces copy (won't expire) when we have one.
  let src = job.finalVideoUrl;
  if (job.finalKey) src = await presignGet(job.finalKey, 3600).catch(() => job.finalVideoUrl);

  await prisma.recreation.update({
    where: { id: params.id },
    data: { finalVideoUrl: src, finalKey: null, driveError: null, stage: "Adding captions…" },
  });
  return NextResponse.json({ ok: true });
}
