// API: single bad output — update metadata + delete (also removes the Spaces file).
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { spaces, spacesConfigured, SPACES_BUCKET } from "@/lib/spaces";

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    const data: any = {};
    if (body.aiUsed !== undefined) data.aiUsed = body.aiUsed?.trim() || null;
    if (body.issue !== undefined) data.issue = body.issue?.trim() || null;
    if (body.reason !== undefined) data.reason = body.reason?.trim() || null;
    if (body.notes !== undefined) data.notes = body.notes?.trim() || null;
    if (body.addedBy !== undefined) data.addedBy = body.addedBy?.trim() || null;
    if (Array.isArray(body.niche)) {
      data.niche = body.niche
        .filter((n: any) => typeof n === "string" && n.trim())
        .map((n: string) => n.trim());
    }
    const item = await prisma.badOutput.update({ where: { id: params.id }, data });
    return NextResponse.json({ ...item, videoUrl: `/api/bad-outputs/${item.id}/video` });
  } catch (error) {
    console.error("Bad output update error:", error);
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const item = await prisma.badOutput.findUnique({ where: { id: params.id } });
    if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (spacesConfigured() && item.videoKey) {
      try {
        await spaces().send(new DeleteObjectCommand({ Bucket: SPACES_BUCKET, Key: item.videoKey }));
      } catch (e) {
        console.error("Spaces delete skipped:", e);
      }
    }
    await prisma.badOutput.delete({ where: { id: params.id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Bad output delete error:", error);
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}
