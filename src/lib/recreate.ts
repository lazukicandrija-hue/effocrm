// Auto-Recreate orchestration — the CRM acts as a "robot VA" on the RUNNING-HUB
// Airtable base: create a row, tick START, poll STATUS, carry the result forward.
// APPEND-ONLY: it never edits or deletes existing Airtable rows, fields, or data.
//
// Pipeline per job:
//   QUEUED → (prompt service downloads reel + first frame → Spaces)
//          → create image-edit row (frame + prompt, START=✓)  → IMAGE_WAIT
//   IMAGE_WAIT → poll image-edit STATUS → on "done" grab OUTPUT_URL (Poppy image)
//              → create Motion-Control row (reel + Poppy image, START=✓) → MOTION_WAIT
//   MOTION_WAIT → poll Motion-Control STATUS → on "done" grab OUTPUT_URL (final reel) → DONE
import prisma from "@/lib/prisma";
import {
  createRecord,
  getRecord,
  attach,
  airtableConfigured,
  AT_TABLES,
  AT_FIELDS,
} from "@/lib/airtable";
import { presignGet, spacesConfigured } from "@/lib/spaces";

export const DEFAULT_PROMPT = "make her hair blonde and remove any text from the screen";

const KLING_URL = (process.env.SEEDANCE_API_URL || "").replace(/\/$/, "");
const KLING_SECRET = process.env.SEEDANCE_API_SECRET || "";

const MAX_PREP_PER_TICK = 2; // the reel download is the slow step — bound per tick
const DAILY_CAP = 150; // safety: max jobs started per rolling 24h

export function pipelineReady(): { ok: boolean; reason?: string } {
  if (!KLING_URL) return { ok: false, reason: "prompt service not connected" };
  if (!spacesConfigured()) return { ok: false, reason: "storage not configured" };
  if (!airtableConfigured()) return { ok: false, reason: "Airtable not connected" };
  return { ok: true };
}

async function failJob(id: string, e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  await prisma.recreation
    .update({ where: { id }, data: { status: "FAILED", stage: "Failed", error: msg.slice(0, 500) } })
    .catch(() => {});
}

async function klingReelAssets(url: string): Promise<{ frameKey: string; reelKey: string }> {
  const res = await fetch(`${KLING_URL}/reel-assets`, {
    method: "POST",
    headers: { Authorization: `Bearer ${KLING_SECRET}`, "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
    signal: AbortSignal.timeout(90000),
  });
  const text = await res.text();
  let data: any = {};
  try {
    data = JSON.parse(text);
  } catch {
    /* HTML error page */
  }
  if (!res.ok)
    throw new Error(`reel download failed (${res.status}): ${data?.detail || text.slice(0, 160)}`);
  if (!data.frame_key || !data.reel_key) throw new Error("reel download returned no assets");
  return { frameKey: data.frame_key, reelKey: data.reel_key };
}

// QUEUED → download reel + frame → create image-edit row → IMAGE_WAIT
async function prep(job: any) {
  // Atomic claim so overlapping ticks can't double-process the same job.
  const claimed = await prisma.recreation.updateMany({
    where: { id: job.id, status: "QUEUED" },
    data: { status: "PREPPING", stage: "Downloading reel + first frame…" },
  });
  if (claimed.count === 0) return;

  const { frameKey, reelKey } = await klingReelAssets(job.sourceUrl);
  const frameUrl = await presignGet(frameKey, 3600);
  const recId = await createRecord(AT_TABLES.IMAGE_EDIT, {
    [AT_FIELDS.IMAGE]: attach(frameUrl),
    [AT_FIELDS.PROMPT]: job.prompt,
    [AT_FIELDS.START]: true,
  });
  await prisma.recreation.update({
    where: { id: job.id },
    data: { frameKey, reelKey, imageRecordId: recId, status: "IMAGE_WAIT", stage: "Making the Poppy image…" },
  });
}

// IMAGE_WAIT → poll image-edit STATUS → on done create Motion-Control row → MOTION_WAIT
async function checkImage(job: any) {
  const fields = await getRecord(AT_TABLES.IMAGE_EDIT, job.imageRecordId);
  const status = String(fields[AT_FIELDS.STATUS] || "").trim();
  if (/^error/i.test(status)) throw new Error(`image edit failed: ${status}`);
  if (status.toLowerCase() !== "done") return; // still running
  const poppyUrl = String(fields[AT_FIELDS.OUTPUT_URL] || "").trim();
  if (!poppyUrl) return; // done but URL not written yet — check again next tick

  const reelUrl = await presignGet(job.reelKey, 3600);
  const recId = await createRecord(AT_TABLES.MOTION, {
    [AT_FIELDS.REEL]: attach(reelUrl),
    [AT_FIELDS.IMAGE]: attach(poppyUrl),
    [AT_FIELDS.START]: true,
  });
  await prisma.recreation.update({
    where: { id: job.id },
    data: { poppyImageUrl: poppyUrl, motionRecordId: recId, status: "MOTION_WAIT", stage: "Rendering the reel (7–10 min)…" },
  });
}

// MOTION_WAIT → poll Motion-Control STATUS → on done store the final video → DONE
async function checkMotion(job: any) {
  const fields = await getRecord(AT_TABLES.MOTION, job.motionRecordId);
  const status = String(fields[AT_FIELDS.STATUS] || "").trim();
  if (/^error/i.test(status)) throw new Error(`Motion Control failed: ${status}`);
  if (status.toLowerCase() !== "done") return;
  const videoUrl = String(fields[AT_FIELDS.OUTPUT_URL] || "").trim();
  if (!videoUrl) return;
  await prisma.recreation.update({
    where: { id: job.id },
    data: { finalVideoUrl: videoUrl, status: "DONE", stage: "Done" },
  });
}

// Advance every in-flight job by one step. Safe to call repeatedly.
export async function tick(): Promise<{ prepped: number; imageChecked: number; motionChecked: number }> {
  let prepped = 0,
    imageChecked = 0,
    motionChecked = 0;

  const queued = await prisma.recreation.findMany({
    where: { status: "QUEUED" },
    take: MAX_PREP_PER_TICK,
    orderBy: { createdAt: "asc" },
  });
  for (const j of queued) {
    try {
      await prep(j);
      prepped++;
    } catch (e) {
      await failJob(j.id, e);
    }
  }

  const imgWait = await prisma.recreation.findMany({ where: { status: "IMAGE_WAIT" }, take: 25 });
  for (const j of imgWait) {
    try {
      await checkImage(j);
      imageChecked++;
    } catch (e) {
      await failJob(j.id, e);
    }
  }

  const motWait = await prisma.recreation.findMany({ where: { status: "MOTION_WAIT" }, take: 25 });
  for (const j of motWait) {
    try {
      await checkMotion(j);
      motionChecked++;
    } catch (e) {
      await failJob(j.id, e);
    }
  }

  return { prepped, imageChecked, motionChecked };
}

export async function createJob(url: string, opts: { prompt?: string; addedBy?: string } = {}) {
  const dayAgo = new Date(Date.now() - 24 * 3600 * 1000);
  const count = await prisma.recreation.count({ where: { createdAt: { gte: dayAgo } } });
  if (count >= DAILY_CAP) throw new Error(`Daily cap reached (${DAILY_CAP}/day) — try again later.`);
  return prisma.recreation.create({
    data: {
      sourceUrl: url.trim(),
      prompt: (opts.prompt || DEFAULT_PROMPT).trim(),
      addedBy: opts.addedBy || null,
      status: "QUEUED",
      stage: "Queued",
    },
  });
}
