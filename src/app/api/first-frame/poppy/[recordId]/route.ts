// API: poll a First Frame → Poppy job. Reads the Airtable image-edit record; when
// STATUS is "done", copies the Poppy result into Spaces and returns a presigned
// URL (CORS-friendly, so the browser can copy/download it reliably).
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getRecord, AT_TABLES, AT_FIELDS, airtableConfigured } from "@/lib/airtable";
import { putBuffer, presignGet, spacesConfigured } from "@/lib/spaces";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: { recordId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!airtableConfigured()) return NextResponse.json({ error: "Airtable not connected." }, { status: 503 });

  let fields: Record<string, any>;
  try {
    fields = await getRecord(AT_TABLES.IMAGE_EDIT, params.recordId);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Couldn't read the job." }, { status: 502 });
  }

  const status = String(fields[AT_FIELDS.STATUS] || "").trim();
  if (/^error/i.test(status)) {
    return NextResponse.json({ status: "error", error: status });
  }
  if (status.toLowerCase() !== "done") {
    return NextResponse.json({ status: "running" });
  }

  const outUrl = String(fields[AT_FIELDS.OUTPUT_URL] || "").trim();
  if (!outUrl) return NextResponse.json({ status: "running" }); // done but URL not written yet

  // Copy the result into Spaces so the browser gets a CORS-friendly URL. Deterministic
  // key → re-polling "done" just overwrites the same object (no storage bloat).
  if (spacesConfigured()) {
    try {
      const res = await fetch(outUrl, { signal: AbortSignal.timeout(60000) });
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        const type = res.headers.get("content-type") || "image/jpeg";
        const ext = type.includes("png") ? "png" : "jpg";
        const key = `poppy-frames/out-${params.recordId}.${ext}`;
        await putBuffer(key, buf, type);
        const url = await presignGet(key, 3600);
        return NextResponse.json({ status: "done", url });
      }
    } catch {
      /* fall back to the raw URL below */
    }
  }
  return NextResponse.json({ status: "done", url: outUrl });
}
