// API: clear the thumbnail retry-backoff so previews that failed to cache will be
// re-fetched on next view. Auth via the scraper secret (not a user session) so it
// can be triggered by tooling. Only touches rows WITHOUT a cached image, so it
// never discards a preview we already have.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

const SCRAPER_SECRET = process.env.SCRAPER_SECRET || "effortless-scraper-2026";

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${SCRAPER_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    await prisma.inspiration.updateMany({
      where: { thumbnailData: null },
      data: { thumbnailTriedAt: null },
    });
    const pending = await prisma.inspiration.findMany({
      where: { thumbnailData: null },
      select: { id: true },
    });
    return NextResponse.json({
      count: pending.length,
      ids: pending.map((p) => p.id),
    });
  } catch (error) {
    console.error("refresh-thumbs error:", error);
    return NextResponse.json(
      { error: "Failed", detail: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
