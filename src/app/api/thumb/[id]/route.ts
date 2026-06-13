// API: serve a reel's thumbnail from a PERMANENT cached copy.
//
// Instagram's thumbnail URLs are signed and expire within days/weeks. We store the
// *link* at scrape time, so older links rot and the image goes blank. This endpoint
// fixes that: it serves a cached copy of the image BYTES, and lazily captures that
// copy the first time the thumbnail is viewed while its link is still alive. After
// that, the thumbnail survives even when Instagram's link is dead.
//
// Public (no auth) because <img> tags can't send an auth header — same as img-proxy.
// Thumbnails are public IG content and reel ids are non-enumerable cuids.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// 1x1 transparent GIF — shown when we have no image (yet) so the layout stays clean.
const PIXEL = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");
function pixel() {
  return new NextResponse(PIXEL, {
    headers: { "Content-Type": "image/gif", "Cache-Control": "public, max-age=300" },
  });
}

// Some CDNs hotlink-protect by Referer; match the host so the fetch succeeds.
function refererFor(url: string): string {
  const l = url.toLowerCase();
  if (l.includes("tiktok")) return "https://www.tiktok.com/";
  if (l.includes("ytimg") || l.includes("youtube") || l.includes("ggpht")) return "https://www.youtube.com/";
  return "https://www.instagram.com/";
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params;

  let reel: { thumbnailData: Buffer | null; thumbnailType: string | null; thumbnailUrl: string | null } | null;
  try {
    reel = await prisma.reel.findUnique({
      where: { id },
      select: { thumbnailData: true, thumbnailType: true, thumbnailUrl: true },
    });
  } catch {
    return pixel();
  }
  if (!reel) return pixel();

  // 1. Serve the permanent cached copy if we have one. Immutable — it never changes.
  if (reel.thumbnailData) {
    return new NextResponse(Buffer.from(reel.thumbnailData), {
      headers: {
        "Content-Type": reel.thumbnailType || "image/jpeg",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  }

  // 2. No cached copy yet — try to fetch the (possibly expired) Instagram link.
  if (!reel.thumbnailUrl) return pixel();
  try {
    const res = await fetch(reel.thumbnailUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        Referer: refererFor(reel.thumbnailUrl),
      },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return pixel(); // link expired/blocked — nothing to do until the next scrape refreshes it

    const buffer = Buffer.from(await res.arrayBuffer());
    const contentType = res.headers.get("content-type") || "image/jpeg";

    // 3. Cache it permanently so it survives the link expiring. Best-effort: if the
    //    write fails we still serve the image (DO App Platform keeps the process
    //    alive, so this floating write completes).
    prisma.reel
      .update({ where: { id }, data: { thumbnailData: buffer, thumbnailType: contentType } })
      .catch((e) => console.error("thumb cache write skipped:", e));

    return new NextResponse(buffer, {
      headers: { "Content-Type": contentType, "Cache-Control": "public, max-age=3600" },
    });
  } catch {
    return pixel();
  }
}
