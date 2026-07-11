// API: stream a bad-output video by redirecting to a short-lived presigned Spaces
// URL. Public (no session) because <video> can't send an auth header — same as the
// image routes; ids are non-enumerable cuids and these clips aren't sensitive.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { spaces, spacesConfigured, SPACES_BUCKET } from "@/lib/spaces";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!spacesConfigured()) return new NextResponse("Video storage not configured", { status: 503 });
  try {
    const item = await prisma.badOutput.findUnique({
      where: { id: params.id },
      select: { videoKey: true },
    });
    if (!item) return new NextResponse("Not found", { status: 404 });
    const url = await getSignedUrl(
      spaces(),
      new GetObjectCommand({ Bucket: SPACES_BUCKET, Key: item.videoKey }),
      { expiresIn: 3600 }
    );
    return NextResponse.redirect(url, 302);
  } catch {
    return new NextResponse("Error", { status: 500 });
  }
}
