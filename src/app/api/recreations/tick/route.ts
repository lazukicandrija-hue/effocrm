// API: advance every in-flight Auto-Recreate job by one step. Driven by the CRM
// page while open, and (later) by a cron for hands-off runs. Session OR scraper
// secret — the latter lets an external scheduler drive it headlessly.
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { tick } from "@/lib/recreate";
import { advancePoppyFrames } from "@/lib/poppyframe";

const SCRAPER_SECRET = process.env.SCRAPER_SECRET || "effortless-scraper-2026";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const ok = !!session || req.headers.get("authorization") === `Bearer ${SCRAPER_SECRET}`;
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // The Auto-Recreate pipeline and the First Frame → Poppy finalizer run
  // independently — a failure in one must never stop the other.
  const out: Record<string, any> = { ok: true };
  try {
    Object.assign(out, await tick());
  } catch (e: any) {
    out.tickError = e?.message || "tick failed";
  }
  try {
    out.poppy = await advancePoppyFrames();
  } catch (e: any) {
    out.poppyError = e?.message || "poppy advance failed";
  }
  return NextResponse.json(out);
}
