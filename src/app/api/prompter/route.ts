// API: standalone Seedance prompter — start a job (URL or uploaded file), then poll it.
// A full analysis takes 1-3 min, longer than the platform's request timeout, so we use
// the prompt service's async job API: POST starts a job (returns instantly), GET polls it.
// Server-side so the API secret never reaches the browser.
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

const API_URL = (process.env.SEEDANCE_API_URL || "").replace(/\/$/, "");
const API_SECRET = process.env.SEEDANCE_API_SECRET || "";
const MAX_UPLOAD = 60 * 1024 * 1024; // 60 MB — reels are small; keeps the CRM instance safe

function authHeaders(extra?: Record<string, string>) {
  return { ...(API_SECRET ? { Authorization: `Bearer ${API_SECRET}` } : {}), ...(extra || {}) };
}

// POST — start a job. Accepts JSON { url } or a multipart file upload. Returns { job_id }.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!API_URL) {
    return NextResponse.json({ error: "The prompt service isn't connected yet (SEEDANCE_API_URL not set)." }, { status: 503 });
  }

  const contentType = req.headers.get("content-type") || "";

  try {
    // ── File upload ──
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!file || typeof file === "string") return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
      if (file.size === 0) return NextResponse.json({ error: "That file is empty." }, { status: 400 });
      if (file.size > MAX_UPLOAD) {
        return NextResponse.json({ error: `File too large (max ${MAX_UPLOAD / 1024 / 1024} MB). Trim or compress the clip.` }, { status: 413 });
      }
      const fwd = new FormData();
      fwd.append("file", file, file.name || "upload.mp4");
      const res = await fetch(`${API_URL}/jobs/upload`, {
        method: "POST",
        headers: authHeaders(),
        body: fwd,
        signal: AbortSignal.timeout(120000), // upload of the bytes only — analysis is async
      });
      if (!res.ok) {
        const d = await res.text().catch(() => "");
        return NextResponse.json({ error: `Prompt service error (${res.status}). ${d.slice(0, 200)}` }, { status: 502 });
      }
      return NextResponse.json(await res.json()); // { job_id }
    }

    // ── Pasted URL ──
    const body = await req.json().catch(() => ({} as any));
    const url = body?.url;
    if (!url || typeof url !== "string" || !/^https?:\/\//i.test(url.trim())) {
      return NextResponse.json({ error: "Paste a valid reel or video URL (https://…)." }, { status: 400 });
    }
    const res = await fetch(`${API_URL}/jobs/url`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ url: url.trim() }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) {
      const d = await res.text().catch(() => "");
      return NextResponse.json({ error: `Prompt service error (${res.status}). ${d.slice(0, 200)}` }, { status: 502 });
    }
    return NextResponse.json(await res.json()); // { job_id }
  } catch (e: any) {
    const msg = e?.name === "TimeoutError" ? "Upload timed out — try a smaller clip." : e?.message || "Couldn't start.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// GET ?jobId=… — poll a job. Returns { status: pending|done|error, prompt, firstFrame, … }.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!API_URL) return NextResponse.json({ error: "Not connected." }, { status: 503 });

  const jobId = req.nextUrl.searchParams.get("jobId");
  if (!jobId) return NextResponse.json({ error: "Missing jobId." }, { status: 400 });

  try {
    const res = await fetch(`${API_URL}/jobs/${encodeURIComponent(jobId)}`, {
      headers: authHeaders(),
      signal: AbortSignal.timeout(30000),
    });
    if (res.status === 404) {
      return NextResponse.json({ status: "error", error: "The job expired — please run it again." });
    }
    if (!res.ok) {
      const d = await res.text().catch(() => "");
      return NextResponse.json({ error: `Prompt service error (${res.status}). ${d.slice(0, 200)}` }, { status: 502 });
    }
    const job = await res.json();
    return NextResponse.json({
      status: job.status,
      prompt: job.prompt || "",
      description: job.description || "",
      firstFrame: job.first_frame || "",
      transcript: job.transcript || "",
      error: job.error || "",
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to check status." }, { status: 500 });
  }
}
