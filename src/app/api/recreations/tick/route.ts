// API: advance every in-flight Auto-Recreate job by one step. Driven by the CRM
// page while open, and (later) by a cron for hands-off runs. Session OR scraper
// secret — the latter lets an external scheduler drive it headlessly.
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { tick } from "@/lib/recreate";

const SCRAPER_SECRET = process.env.SCRAPER_SECRET || "effortless-scraper-2026";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const ok = !!session || req.headers.get("authorization") === `Bearer ${SCRAPER_SECRET}`;
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const result = await tick();
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "tick failed" }, { status: 500 });
  }
}
