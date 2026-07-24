// API: Captioner — start a caption job. Accepts a reel/video link ({url}) or the
// Spaces key of a just-uploaded video ({key}). Submits it to the async caption
// service and returns its job id; poll GET /api/captions/[jobId] for the result.
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { presignGet, spacesConfigured } from "@/lib/spaces";
import { klingCaptionSubmit } from "@/lib/recreate";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({} as any));
  let src = "";
  if (body.key) {
    if (!spacesConfigured()) return NextResponse.json({ error: "Storage not set up." }, { status: 503 });
    src = await presignGet(String(body.key), 3600); // let the caption service fetch the upload
  } else if (body.url && /^https?:\/\//i.test(String(body.url))) {
    src = String(body.url).trim();
  } else {
    return NextResponse.json({ error: "Provide a reel link or upload a video." }, { status: 400 });
  }

  try {
    const jobId = await klingCaptionSubmit(src);
    return NextResponse.json({ jobId });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to start captioning" },
      { status: 502 }
    );
  }
}
