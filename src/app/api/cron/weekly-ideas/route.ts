// API: weekly auto-digest — generate AI ideas on a schedule.
// Hit by the VPS scheduler (Task Scheduler) once a week with the scraper secret;
// no session needed. Same logic as the manual "Generate" button.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

const SCRAPER_SECRET = process.env.SCRAPER_SECRET || "effortless-scraper-2026";
const API_URL = (process.env.SEEDANCE_API_URL || "").replace(/\/$/, "");
const API_SECRET = process.env.SEEDANCE_API_SECRET || "";

function median(nums: number[]): number {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export async function POST(req: NextRequest) {
  if ((req.headers.get("authorization") || "") !== `Bearer ${SCRAPER_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!API_URL) return NextResponse.json({ error: "Prompt service not connected." }, { status: 503 });

  const reels = await prisma.reel.findMany({
    where: { account: { igUsername: { not: null } } },
    orderBy: { currentViews: "desc" },
    take: 60,
    select: {
      shortcode: true,
      caption: true,
      currentViews: true,
      account: { select: { id: true, igUsername: true, username: true, niche: true } },
      analysis: { select: { summary: true } },
    },
  });
  if (!reels.length) return NextResponse.json({ created: 0, note: "No reel data yet." });

  const byAcc: Record<string, number[]> = {};
  for (const r of reels) (byAcc[r.account.id] ||= []).push(r.currentViews);
  const base: Record<string, number> = {};
  for (const [a, v] of Object.entries(byAcc)) base[a] = median(v) || 1;

  const payload = reels.slice(0, 25).map((r) => ({
    account: r.account.igUsername || r.account.username,
    caption: r.caption,
    content: r.analysis?.summary || null,
    niche: r.account.niche,
    views: r.currentViews,
    overIndex: Math.round((r.currentViews / (base[r.account.id] || 1)) * 10) / 10,
    url: `https://www.instagram.com/reel/${r.shortcode}/`,
  }));

  let generated: any[] = [];
  try {
    const res = await fetch(`${API_URL}/ideas`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(API_SECRET ? { Authorization: `Bearer ${API_SECRET}` } : {}),
      },
      body: JSON.stringify({ reels: payload, count: 6 }),
      signal: AbortSignal.timeout(90000),
    });
    if (!res.ok) return NextResponse.json({ error: `Idea service ${res.status}` }, { status: 502 });
    generated = (await res.json()).ideas || [];
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "failed" }, { status: 500 });
  }

  let created = 0;
  for (const g of generated) {
    if (!g?.title) continue;
    let sourceReelId: string | null = null;
    if (g.isRecreate && g.sourceUrl) {
      const m = String(g.sourceUrl).match(/\/reel[s]?\/([^/?]+)/);
      if (m) {
        const reel = await prisma.reel.findFirst({ where: { shortcode: m[1] }, select: { id: true } });
        sourceReelId = reel?.id || null;
      }
    }
    await prisma.idea.create({
      data: {
        source: "AI",
        title: String(g.title).slice(0, 200),
        concept: g.concept || null,
        isRecreate: !!g.isRecreate,
        sourceReelId,
        status: "NEW",
      },
    });
    created++;
  }
  return NextResponse.json({ created });
}
