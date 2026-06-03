// Best-effort link preview fetcher for saved inspiration reels.
// - TikTok & YouTube expose public oEmbed endpoints (no token) -> reliable thumbnails.
// - Instagram / everything else: scrape Open Graph tags with a Googlebot UA (best-effort).

import { creatorFromTitle } from "./utils";

export type LinkPreview = {
  platform: string; // instagram | tiktok | youtube | other
  thumbnailUrl: string | null;
  title: string | null;
  creator: string | null; // "@handle" or display name when available
};

export function detectPlatform(url: string): string {
  const u = (url || "").toLowerCase();
  if (u.includes("tiktok.")) return "tiktok";
  if (u.includes("instagram.")) return "instagram";
  if (u.includes("youtube.") || u.includes("youtu.be")) return "youtube";
  return "other";
}

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
const GOOGLEBOT_UA =
  "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";

function withTimeout(ms: number): AbortSignal | undefined {
  try {
    // Node 18.17+ / 20 supports AbortSignal.timeout
    return AbortSignal.timeout(ms);
  } catch {
    return undefined;
  }
}

async function fetchJson(endpoint: string): Promise<any | null> {
  try {
    const res = await fetch(endpoint, {
      headers: { "User-Agent": BROWSER_UA, Accept: "application/json" },
      signal: withTimeout(8000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&#x2F;/gi, "/");
}

function extractMeta(html: string, prop: string): string | null {
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']+)["']`,
      "i"
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${prop}["']`,
      "i"
    ),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m && m[1]) return decodeHtmlEntities(m[1].trim());
  }
  return null;
}

export async function fetchLinkPreview(url: string): Promise<LinkPreview> {
  const platform = detectPlatform(url);
  const result: LinkPreview = {
    platform,
    thumbnailUrl: null,
    title: null,
    creator: null,
  };

  if (!url || !/^https?:\/\//i.test(url)) return result;

  // 1) Reliable oEmbed endpoints (no auth required)
  if (platform === "tiktok") {
    const data = await fetchJson(
      `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`
    );
    if (data) {
      result.thumbnailUrl = data.thumbnail_url || null;
      result.title = data.title || null;
      result.creator = data.author_unique_id
        ? `@${data.author_unique_id}`
        : data.author_name || null;
      if (result.thumbnailUrl) return result;
    }
  }

  if (platform === "youtube") {
    const data = await fetchJson(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`
    );
    if (data) {
      result.thumbnailUrl = data.thumbnail_url || null;
      result.title = data.title || null;
      result.creator = data.author_name || null;
      if (result.thumbnailUrl) return result;
    }
  }

  // 2) Open Graph fallback (Instagram best-effort + generic sites)
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": GOOGLEBOT_UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: withTimeout(8000),
    });
    if (res.ok) {
      const html = (await res.text()).slice(0, 500_000); // cap to avoid huge pages
      result.thumbnailUrl =
        extractMeta(html, "og:image") ||
        extractMeta(html, "twitter:image") ||
        result.thumbnailUrl;
      result.title =
        extractMeta(html, "og:title") ||
        extractMeta(html, "twitter:title") ||
        result.title;
      // Instagram og:title looks like: 'Name on Instagram: "caption..."'
      // or 'Name (@handle) on Instagram' — pull out a clean creator label.
      if (!result.creator) {
        result.creator = creatorFromTitle(result.title);
      }
    }
  } catch {
    // best-effort: return whatever we managed to gather
  }

  return result;
}
