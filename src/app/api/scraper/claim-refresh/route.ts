// API: the VPS scraper claims a pending "Refresh now" request.
// Auth via the scraper secret (not a user session). Returns { claimed: true } and
// clears the flag if a refresh was pending, otherwise { claimed: false }.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

const SCRAPER_SECRET = process.env.SCRAPER_SECRET || "effortless-scraper-2026";
const SINGLETON = "singleton";

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${SCRAPER_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const control = await prisma.scraperControl.findUnique({
      where: { id: SINGLETON },
    });
    if (control?.refreshRequestedAt) {
      await prisma.scraperControl.update({
        where: { id: SINGLETON },
        data: { refreshRequestedAt: null },
      });
      return NextResponse.json({ claimed: true });
    }
    return NextResponse.json({ claimed: false });
  } catch (error) {
    console.error("claim-refresh error:", error);
    return NextResponse.json({ claimed: false }, { status: 500 });
  }
}
