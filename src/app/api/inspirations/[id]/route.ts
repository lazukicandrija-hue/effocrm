// API: Single inspiration — update + delete
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { detectPlatform, fetchLinkPreview } from "@/lib/link-preview";

// 2-state model: In progress = RECREATING, Done = DONE (legacy IDEA tolerated).
const STATUSES = ["RECREATING", "DONE"];

// PUT - update an inspiration
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const existing = await prisma.inspiration.findUnique({
      where: { id: params.id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = await req.json();
    const data: any = {};

    if (typeof body.url === "string" && body.url.trim()) {
      data.url = body.url.trim();
      data.platform = detectPlatform(data.url);
    }
    if (body.creator !== undefined) data.creator = body.creator?.trim() || null;
    if (body.title !== undefined) data.title = body.title?.trim() || null;
    if (body.thumbnailUrl !== undefined)
      data.thumbnailUrl = body.thumbnailUrl?.trim() || null;
    if (body.notes !== undefined) data.notes = body.notes?.trim() || null;
    if (Array.isArray(body.niche)) {
      data.niche = body.niche
        .filter((n: any) => typeof n === "string" && n.trim())
        .map((n: string) => n.trim());
    }
    if (STATUSES.includes(body.status)) data.status = body.status;
    if (body.modelId !== undefined) data.modelId = body.modelId || null;
    if (body.folderId !== undefined) data.folderId = body.folderId || null;

    // If the link changed and there's still no thumbnail, try to fetch one
    const urlChanged = data.url && data.url !== existing.url;
    const noThumb =
      data.thumbnailUrl === undefined
        ? !existing.thumbnailUrl
        : !data.thumbnailUrl;
    if (urlChanged && noThumb) {
      const preview = await fetchLinkPreview(data.url);
      if (preview.thumbnailUrl) data.thumbnailUrl = preview.thumbnailUrl;
    }

    const inspiration = await prisma.inspiration.update({
      where: { id: params.id },
      data,
      include: { model: { select: { id: true, name: true } } },
    });

    return NextResponse.json(inspiration);
  } catch (error) {
    console.error("Inspiration update error:", error);
    return NextResponse.json(
      { error: "Failed to update inspiration" },
      { status: 500 }
    );
  }
}

// DELETE - remove an inspiration
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await prisma.inspiration.delete({ where: { id: params.id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Inspiration delete error:", error);
    return NextResponse.json(
      { error: "Failed to delete inspiration" },
      { status: 500 }
    );
  }
}
