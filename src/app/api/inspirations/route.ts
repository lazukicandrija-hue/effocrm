// API: Marketing inspiration reels — list + create
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { detectPlatform, fetchLinkPreview } from "@/lib/link-preview";

// 3-state model: "In progress" = RECREATING, "Done" = DONE, "Issue" = ISSUE.
// Legacy rows may still hold IDEA — treated as In progress on read.
const STATUSES = ["RECREATING", "DONE", "ISSUE"];

// GET - list inspirations (with optional filters) + distinct niches in use
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const sp = req.nextUrl.searchParams;
    const search = (sp.get("search") || "").trim();
    const niche = sp.get("niche") || "all";
    const status = sp.get("status") || "all";
    const modelId = sp.get("modelId") || "all";
    const folderId = sp.get("folderId"); // "all"/absent = no filter, "root" = unfiled, else a folder id

    const where: any = {};
    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { creator: { contains: search, mode: "insensitive" } },
        { notes: { contains: search, mode: "insensitive" } },
        { url: { contains: search, mode: "insensitive" } },
      ];
    }
    if (niche !== "all") where.niche = { has: niche };
    if (status === "DONE") where.status = "DONE";
    else if (status === "ISSUE") where.status = "ISSUE";
    else if (status === "RECREATING")
      where.status = { in: ["IDEA", "RECREATING"] }; // "In progress" incl. legacy
    if (modelId !== "all") {
      where.modelId = modelId === "none" ? null : modelId;
    }
    if (folderId && folderId !== "all") {
      where.folderId = folderId === "root" || folderId === "none" ? null : folderId;
    }

    const inspirations = await prisma.inspiration.findMany({
      where,
      include: { model: { select: { id: true, name: true } } },
      orderBy: [{ position: "asc" }, { createdAt: "desc" }],
    });

    // Distinct niches across ALL inspirations (so custom niches persist as buttons)
    const all = await prisma.inspiration.findMany({ select: { niche: true } });
    const allNiches = Array.from(
      new Set(all.flatMap((i) => i.niche))
    ).sort((a, b) => a.localeCompare(b));

    return NextResponse.json({ inspirations, allNiches });
  } catch (error) {
    console.error("Inspirations fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch inspirations" },
      { status: 500 }
    );
  }
}

// POST - create a new inspiration (auto-fetches a thumbnail when none provided)
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const url: string = (body.url || "").trim();
    if (!url) {
      return NextResponse.json({ error: "Reel link is required" }, { status: 400 });
    }

    let thumbnailUrl: string | null = body.thumbnailUrl?.trim() || null;
    let title: string | null = body.title?.trim() || null;
    let creator: string | null = body.creator?.trim() || null;

    // If the client didn't already resolve a preview, try server-side (best-effort)
    if (!thumbnailUrl) {
      const preview = await fetchLinkPreview(url);
      thumbnailUrl = thumbnailUrl || preview.thumbnailUrl;
      title = title || preview.title;
      creator = creator || preview.creator;
    }

    const niche: string[] = Array.isArray(body.niche)
      ? body.niche.filter((n: any) => typeof n === "string" && n.trim()).map((n: string) => n.trim())
      : [];
    const status = STATUSES.includes(body.status) ? body.status : "RECREATING";

    const inspiration = await prisma.inspiration.create({
      data: {
        url,
        platform: detectPlatform(url),
        creator,
        title,
        thumbnailUrl,
        niche,
        notes: body.notes?.trim() || null,
        issueNote: body.issueNote?.trim() || null,
        addedBy: body.addedBy?.trim() || null,
        status,
        modelId: body.modelId || null,
        folderId: body.folderId || null,
      },
      include: { model: { select: { id: true, name: true } } },
    });

    return NextResponse.json(inspiration, { status: 201 });
  } catch (error) {
    console.error("Inspiration create error:", error);
    return NextResponse.json(
      {
        error: "Failed to create inspiration",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
