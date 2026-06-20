// API: serve an inspiration's preview image.
//
// Instagram blocks server-side thumbnail fetches (no public oEmbed; og:image needs a
// login). So we pull the preview through the prompt service's /thumbnail endpoint
// (proxy + cookie) ONCE, cache the bytes on the Inspiration, and serve our own copy
// forever after. A retry-guard (thumbnailTriedAt) stops us hammering dead/private reels.
//
// Public (no auth) because <img> tags can't send a header — same as img-proxy. Reel
// previews are public content and ids are non-enumerable cuids.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

const API_URL = (process.env.SEEDANCE_API_URL || "").replace(/\/$/, "");
const API_SECRET = process.env.SEEDANCE_API_SECRET || "";

const PIXEL = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");
function pixel() {
  return new NextResponse(PIXEL, {
    headers: { "Content-Type": "image/gif", "Cache-Control": "public, max-age=300" },
  });
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params;

  let insp:
    | { thumbnailData: Buffer | null; thumbnailType: string | null; thumbnailUrl: string | null; url: string; thumbnailTriedAt: Date | null }
    | null;
  try {
    insp = await prisma.inspiration.findUnique({
      where: { id },
      select: { thumbnailData: true, thumbnailType: true, thumbnailUrl: true, url: true, thumbnailTriedAt: true },
    });
  } catch {
    return pixel();
  }
  if (!insp) return pixel();

  // 1. Serve the permanent cached copy.
  if (insp.thumbnailData) {
    return new NextResponse(Buffer.from(insp.thumbnailData), {
      headers: {
        "Content-Type": insp.thumbnailType || "image/jpeg",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  }

  // 2. Not cached — fetch via the prompt service (proxy+cookie), but at most every 6h.
  const stale =
    !insp.thumbnailTriedAt || insp.thumbnailTriedAt.getTime() < Date.now() - 6 * 60 * 60 * 1000;
  if (API_URL && insp.url && stale) {
    try {
      const res = await fetch(`${API_URL}/thumbnail`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(API_SECRET ? { Authorization: `Bearer ${API_SECRET}` } : {}),
        },
        body: JSON.stringify({ url: insp.url }),
        signal: AbortSignal.timeout(30000),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.thumbnail) {
          const buf = Buffer.from(data.thumbnail, "base64");
          const ctype = data.content_type || "image/jpeg";
          prisma.inspiration
            .update({ where: { id }, data: { thumbnailData: buf, thumbnailType: ctype, thumbnailTriedAt: new Date() } })
            .catch((e) => console.error("inspiration thumb cache skipped:", e));
          return new NextResponse(buf, {
            headers: { "Content-Type": ctype, "Cache-Control": "public, max-age=86400" },
          });
        }
      }
      // Couldn't fetch — record the attempt so we back off.
      await prisma.inspiration.update({ where: { id }, data: { thumbnailTriedAt: new Date() } }).catch(() => {});
    } catch {
      await prisma.inspiration.update({ where: { id }, data: { thumbnailTriedAt: new Date() } }).catch(() => {});
    }
  }

  // 3. Fallback: a previously-fetched thumbnail URL (TikTok/YouTube oembed, or a manual
  //    paste) via the image proxy; otherwise a clean placeholder pixel.
  if (insp.thumbnailUrl) {
    return NextResponse.redirect(
      new URL(`/api/img-proxy?url=${encodeURIComponent(insp.thumbnailUrl)}`, req.url)
    );
  }
  return pixel();
}
