// API: "Refresh now" — a logged-in user asks the VPS scraper for an on-demand run.
// Raises a flag the scraper picks up on its next (frequent) --if-requested check.
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

const SINGLETON = "singleton";

// POST - raise the refresh flag
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const control = await prisma.scraperControl.upsert({
      where: { id: SINGLETON },
      update: { refreshRequestedAt: new Date() },
      create: { id: SINGLETON, refreshRequestedAt: new Date() },
    });
    return NextResponse.json({
      ok: true,
      refreshRequestedAt: control.refreshRequestedAt,
    });
  } catch (error) {
    console.error("request-refresh error:", error);
    return NextResponse.json(
      { error: "Failed to request refresh" },
      { status: 500 }
    );
  }
}

// GET - current pending-request status (so the button can reflect it)
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const control = await prisma.scraperControl.findUnique({
      where: { id: SINGLETON },
    });
    return NextResponse.json({
      refreshRequestedAt: control?.refreshRequestedAt || null,
    });
  } catch {
    return NextResponse.json({ refreshRequestedAt: null });
  }
}
