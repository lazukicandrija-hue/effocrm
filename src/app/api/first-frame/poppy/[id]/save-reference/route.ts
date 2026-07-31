// API: save a finished Poppy frame into the Reference Images library, in a chosen
// folder (niche). Copies the image to an independent key so deleting the Poppy job
// later doesn't remove the saved reference.
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { copyObject } from "@/lib/spaces";
import { randomUUID } from "crypto";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({} as any));
  const niche = String(body.niche || "").trim().slice(0, 60);
  if (!niche) return NextResponse.json({ error: "Pick a folder." }, { status: 400 });

  const job = await prisma.poppyFrame.findUnique({ where: { id: params.id } });
  if (!job?.resultKey) {
    return NextResponse.json({ error: "No finished Poppy image on this job yet." }, { status: 400 });
  }

  try {
    const ext = (job.resultKey.split(".").pop() || "jpg").slice(0, 5);
    const destKey = `reference-images/${randomUUID()}-poppy.${ext}`;
    await copyObject(job.resultKey, destKey);
    const ref = await prisma.referenceImage.create({
      data: {
        imageKey: destKey,
        niche,
        label: "From First Frame → Poppy",
        addedBy: (session.user?.name || session.user?.email || "").toString().slice(0, 60) || null,
      },
    });
    return NextResponse.json({ id: ref.id, niche });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Couldn't save to Reference Images." }, { status: 502 });
  }
}
