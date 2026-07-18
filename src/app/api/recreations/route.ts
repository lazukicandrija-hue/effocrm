// API: Auto-Recreate jobs — list + create. Create accepts a session (the CRM page)
// OR the scraper secret (so a cron/tooling can queue jobs headlessly).
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { createJob, pipelineReady, DEFAULT_PROMPT } from "@/lib/recreate";
import { presignGet } from "@/lib/spaces";

const SCRAPER_SECRET = process.env.SCRAPER_SECRET || "effortless-scraper-2026";

async function authed(req: NextRequest): Promise<boolean> {
  const session = await getServerSession(authOptions);
  if (session) return true;
  return req.headers.get("authorization") === `Bearer ${SCRAPER_SECRET}`;
}

export async function GET(req: NextRequest) {
  if (!(await authed(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rows = await prisma.recreation.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
  // Serve the permanent Spaces copy (fresh 6-day signed URL) when we have one;
  // otherwise fall back to the stored RunningHub URL.
  const items = await Promise.all(
    rows.map(async (r) => ({
      ...r,
      finalVideoUrl: r.finalKey
        ? await presignGet(r.finalKey, 6 * 24 * 3600).catch(() => r.finalVideoUrl)
        : r.finalVideoUrl,
    }))
  );
  return NextResponse.json({ items, ready: pipelineReady(), defaultPrompt: DEFAULT_PROMPT });
}

export async function POST(req: NextRequest) {
  if (!(await authed(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ready = pipelineReady();
  if (!ready.ok) {
    return NextResponse.json({ error: `Pipeline not ready yet (${ready.reason}).` }, { status: 503 });
  }
  const body = await req.json().catch(() => ({} as any));
  const raw: string[] = Array.isArray(body.urls) ? body.urls : body.url ? [body.url] : [];
  const urls = raw.map((u) => String(u).trim()).filter((u) => /^https?:\/\//i.test(u));
  if (!urls.length) {
    return NextResponse.json({ error: "Paste at least one reel link (https://…)." }, { status: 400 });
  }
  try {
    const created = [];
    for (const u of urls) {
      created.push(await createJob(u, { prompt: body.prompt, addedBy: body.addedBy }));
    }
    return NextResponse.json({ created }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to queue" }, { status: 400 });
  }
}

// Bulk "clear failed" — removes every FAILED job. Session only, and only ever
// touches FAILED rows, so it can't wipe in-progress or finished reels.
export async function DELETE() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const res = await prisma.recreation.deleteMany({ where: { status: "FAILED" } });
  return NextResponse.json({ deleted: res.count });
}
