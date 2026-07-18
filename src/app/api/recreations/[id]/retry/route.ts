// API: re-run a FAILED Auto-Recreate job (re-queues the render, or restarts it).
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { retryJob } from "@/lib/recreate";

const SCRAPER_SECRET = process.env.SCRAPER_SECRET || "effortless-scraper-2026";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const ok = !!session || req.headers.get("authorization") === `Bearer ${SCRAPER_SECRET}`;
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const job = await retryJob(params.id);
  if (!job) return NextResponse.json({ error: "Job not found or not in a failed state" }, { status: 400 });
  return NextResponse.json({ ok: true, job });
}
