// API: Proxy Instagram thumbnails to avoid CORS and expired CDN URLs
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) {
    return NextResponse.json({ error: "Missing url param" }, { status: 400 });
  }

  // Pick a referer that matches the CDN host (some CDNs hotlink-protect by referer).
  // Instagram/fbcdn behaviour is preserved as the default.
  const lower = url.toLowerCase();
  let referer = "https://www.instagram.com/";
  if (lower.includes("tiktokcdn") || lower.includes("tiktok")) {
    referer = "https://www.tiktok.com/";
  } else if (lower.includes("ytimg") || lower.includes("youtube") || lower.includes("ggpht")) {
    referer = "https://www.youtube.com/";
  }

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Referer": referer,
      },
      // Cache for 1 hour
      next: { revalidate: 3600 },
    });

    if (!response.ok) {
      // Return a 1x1 transparent pixel if image fetch fails
      const pixel = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");
      return new NextResponse(pixel, {
        headers: {
          "Content-Type": "image/gif",
          "Cache-Control": "public, max-age=60",
        },
      });
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get("content-type") || "image/jpeg";

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=3600, s-maxage=3600",
      },
    });
  } catch {
    const pixel = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");
    return new NextResponse(pixel, {
      headers: { "Content-Type": "image/gif", "Cache-Control": "public, max-age=60" },
    });
  }
}
