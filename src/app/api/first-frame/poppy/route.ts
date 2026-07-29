// API: First Frame → Poppy. POST grabs a reel's opening frame, drops it into a NEW
// Airtable image-edit row (START ticked — append-only, exactly what a VA does), and
// persists a PoppyFrame job. The 24/7 tick loop finalizes it, so the Poppy image
// comes back even if the page is closed. GET lists the queue.
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { putBuffer, presignGet, spacesConfigured } from "@/lib/spaces";
import { createRecord, AT_TABLES, AT_FIELDS, attach, airtableConfigured } from "@/lib/airtable";

export const dynamic = "force-dynamic";

const API_URL = (process.env.SEEDANCE_API_URL || "").replace(/\/$/, "");
const API_SECRET = process.env.SEEDANCE_API_SECRET || "";
// Same edit instruction the Auto-Recreate pipeline uses to turn a source frame into
// Poppy. Users can override per request.
const DEFAULT_EDIT = "make her hair blonde and remove any text from the screen";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const jobs = await prisma.poppyFrame.findMany({ orderBy: { createdAt: "desc" }, take: 15 });
  const items = await Promise.all(
    jobs.map(async (j) => ({
      id: j.id,
      status: j.status,
      sourceUrl: j.sourceUrl,
      error: j.error,
      createdAt: j.createdAt,
      source: j.sourceKey ? await presignGet(j.sourceKey, 3600).catch(() => null) : null,
      url: j.resultKey ? await presignGet(j.resultKey, 3600).catch(() => null) : null,
    }))
  );
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!API_URL) return NextResponse.json({ error: "Prompt service not connected (SEEDANCE_API_URL)." }, { status: 503 });
  if (!spacesConfigured()) return NextResponse.json({ error: "Storage not configured (Spaces)." }, { status: 503 });
  if (!airtableConfigured()) return NextResponse.json({ error: "Airtable not connected." }, { status: 503 });

  const body = await req.json().catch(() => ({} as any));
  const url = (body?.url || "").toString().trim();
  const prompt = (body?.prompt || "").toString().trim() || DEFAULT_EDIT;
  if (!/^https?:\/\//i.test(url)) {
    return NextResponse.json({ error: "Paste a valid reel or video URL (https://…)." }, { status: 400 });
  }

  // 1) Opening frame from the prompt service (same path as the First Frame tool).
  let frameB64 = "";
  let frameType = "image/jpeg";
  try {
    const res = await fetch(`${API_URL}/first-frame`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(API_SECRET ? { Authorization: `Bearer ${API_SECRET}` } : {}),
      },
      body: JSON.stringify({ url }),
      signal: AbortSignal.timeout(60000),
    });
    const text = await res.text();
    let j: any = {};
    try {
      j = JSON.parse(text);
    } catch {
      /* HTML error page */
    }
    if (!res.ok || !j.first_frame) {
      return NextResponse.json(
        {
          error:
            j.detail ||
            j.error ||
            "Couldn't fetch that reel — the link download may be down. Try again in a moment.",
        },
        { status: 502 }
      );
    }
    frameB64 = j.first_frame;
    frameType = j.content_type || "image/jpeg";
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Reel download failed." }, { status: 502 });
  }

  // 2) Store the frame, create the image-edit row, and persist the job.
  try {
    const buf = Buffer.from(frameB64, "base64");
    const ext = frameType.includes("png") ? "png" : "jpg";
    const key = `poppy-frames/src-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    await putBuffer(key, buf, frameType);
    const frameUrl = await presignGet(key, 3600);
    const recordId = await createRecord(AT_TABLES.IMAGE_EDIT, {
      [AT_FIELDS.IMAGE]: attach(frameUrl),
      [AT_FIELDS.PROMPT]: prompt,
      [AT_FIELDS.START]: true,
    });
    const job = await prisma.poppyFrame.create({
      data: { sourceUrl: url, sourceKey: key, prompt, imageRecordId: recordId, status: "WORKING" },
    });
    return NextResponse.json({ id: job.id, sourceFrame: frameB64, sourceType: frameType });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Couldn't start the image-edit." }, { status: 502 });
  }
}
