// API: hand the browser a presigned PUT URL so it can upload a video straight to
// Spaces (bypassing this server — no App Platform body-size limit, no proxying).
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { spaces, spacesConfigured, SPACES_BUCKET } from "@/lib/spaces";
import { randomUUID } from "crypto";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!spacesConfigured()) {
    return NextResponse.json(
      { error: "Video storage isn't set up yet. Add the Spaces keys to enable uploads." },
      { status: 503 }
    );
  }
  try {
    const { filename, contentType } = await req.json();
    const safe = String(filename || "video")
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .slice(-80);
    const key = `bad-outputs/${randomUUID()}-${safe}`;
    const cmd = new PutObjectCommand({
      Bucket: SPACES_BUCKET,
      Key: key,
      ContentType: contentType || "video/mp4",
    });
    const uploadUrl = await getSignedUrl(spaces(), cmd, { expiresIn: 600 });
    return NextResponse.json({ uploadUrl, key });
  } catch (e) {
    return NextResponse.json(
      { error: "Failed to create upload URL", detail: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
