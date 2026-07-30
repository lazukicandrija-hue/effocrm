// API: manage a First Frame → Poppy job.
//   DELETE — remove it (row + stored source/result images).
//   POST   — retry a failed job by re-submitting its saved frame to a NEW image-edit
//            row (append-only). No reel re-download; reuses the stored first frame.
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { deleteObject, presignGet } from "@/lib/spaces";
import { createRecord, AT_TABLES, AT_FIELDS, attach, airtableConfigured } from "@/lib/airtable";

const DEFAULT_EDIT = "make her hair blonde and remove any text from the screen";

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const row = await prisma.poppyFrame.findUnique({ where: { id: params.id } });
  if (row) {
    if (row.sourceKey) await deleteObject(row.sourceKey).catch(() => {});
    if (row.resultKey) await deleteObject(row.resultKey).catch(() => {});
    await prisma.poppyFrame.delete({ where: { id: params.id } }).catch(() => {});
  }
  return NextResponse.json({ success: true });
}

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!airtableConfigured()) return NextResponse.json({ error: "Airtable not connected." }, { status: 503 });

  const job = await prisma.poppyFrame.findUnique({ where: { id: params.id } });
  if (!job) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (!job.sourceKey) {
    return NextResponse.json({ error: "No saved frame to retry — run it again from the top." }, { status: 400 });
  }

  try {
    const frameUrl = await presignGet(job.sourceKey, 3600);
    const recordId = await createRecord(AT_TABLES.IMAGE_EDIT, {
      [AT_FIELDS.IMAGE]: attach(frameUrl),
      [AT_FIELDS.PROMPT]: job.prompt || DEFAULT_EDIT,
      [AT_FIELDS.START]: true,
    });
    // Back to WORKING with the new row; reset createdAt so the finalizer's timeout restarts.
    await prisma.poppyFrame.update({
      where: { id: job.id },
      data: { status: "WORKING", imageRecordId: recordId, error: null, resultKey: null, createdAt: new Date() },
    });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Retry failed." }, { status: 502 });
  }
}
