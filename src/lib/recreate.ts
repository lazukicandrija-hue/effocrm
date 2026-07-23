// Auto-Recreate orchestration — the CRM acts as a "robot VA" on the RUNNING-HUB
// Airtable base: create a row, tick START, poll STATUS, carry the result forward.
// APPEND-ONLY: it never edits or deletes existing Airtable rows, fields, or data.
//
// Pipeline per job:
//   QUEUED → (prompt service downloads reel + first frame → Spaces)
//          → create image-edit row (frame + prompt, START=✓)  → IMAGE_WAIT
//   IMAGE_WAIT → poll image-edit STATUS → on "done" grab OUTPUT_URL (Poppy image) → IMAGE_DONE
//   IMAGE_DONE → (when a render slot is free) create Motion-Control row (reel + Poppy
//                image, START=✓) → MOTION_WAIT
//   MOTION_WAIT → poll Motion-Control STATUS → on "done" grab OUTPUT_URL (final reel) → DONE
// New RunningHub tasks are only started while under MAX_INFLIGHT concurrent tasks,
// so queuing many reels at once can't trip the API's concurrency limit.
import prisma from "@/lib/prisma";
import {
  createRecord,
  getRecord,
  attach,
  airtableConfigured,
  AT_TABLES,
  AT_FIELDS,
} from "@/lib/airtable";
import { presignGet, spacesConfigured, putBuffer } from "@/lib/spaces";
import { maybeUploadToDrive } from "@/lib/drive";

export const DEFAULT_PROMPT = "make her hair blonde and remove any text from the screen";

const KLING_URL = (process.env.SEEDANCE_API_URL || "").replace(/\/$/, "");
const KLING_SECRET = process.env.SEEDANCE_API_SECRET || "";

const MAX_PREP_PER_TICK = 2; // the reel download is the slow step — bound per tick
const DAILY_CAP = 150; // safety: max jobs started per rolling 24h
// Max RunningHub tasks (image-edit + Motion-Control) in flight at once. Firing too
// many simultaneously trips RunningHub's concurrency limit (APIKEY_TASK_STATUS_ERROR),
// which is what fails reels when several are queued together. Tunable via env.
const MAX_INFLIGHT = Number(process.env.MAX_RH_INFLIGHT) || 2;
const MAX_CAPTION_PER_TICK = 2; // captioning (whisper + ffmpeg) is slow — bound per tick

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

// IMAGE_WAIT → poll image-edit STATUS → on done park in IMAGE_DONE (motion is
// submitted later, under the concurrency cap, by submitMotion).
async function checkImage(job: any) {
  const fields = await getRecord(AT_TABLES.IMAGE_EDIT, job.imageRecordId);
  const status = String(fields[AT_FIELDS.STATUS] || "").trim();
  if (/^error/i.test(status)) throw new Error(`image edit failed: ${status}`);
  if (status.toLowerCase() !== "done") return; // still running
  const poppyUrl = String(fields[AT_FIELDS.OUTPUT_URL] || "").trim();
  if (!poppyUrl) return; // done but URL not written yet — check again next tick

  // Park it: the Poppy image is ready, but hold before submitting the render so we
  // don't blow past RunningHub's concurrency cap. Atomic so racing ticks don't
  // double-advance.
  await prisma.recreation.updateMany({
    where: { id: job.id, status: "IMAGE_WAIT" },
    data: { poppyImageUrl: poppyUrl, status: "IMAGE_DONE", stage: "Waiting for a render slot…" },
  });
}

// IMAGE_DONE → create Motion-Control row (START) → MOTION_WAIT. Called only when a
// render slot is free (see tick), so we never exceed MAX_INFLIGHT concurrent tasks.
async function submitMotion(job: any) {
  const claimed = await prisma.recreation.updateMany({
    where: { id: job.id, status: "IMAGE_DONE" },
    data: { status: "MOTION_WAIT", stage: "Rendering the reel (7–10 min)…" },
  });
  if (claimed.count === 0) return; // another tick grabbed this slot

  const reelUrl = await presignGet(job.reelKey, 3600);
  const recId = await createRecord(AT_TABLES.MOTION, {
    [AT_FIELDS.REEL]: attach(reelUrl),
    [AT_FIELDS.IMAGE]: attach(job.poppyImageUrl),
    [AT_FIELDS.START]: true,
  });
  await prisma.recreation.update({ where: { id: job.id }, data: { motionRecordId: recId } });
}

async function downloadReel(url: string): Promise<Buffer> {
  const res = await fetch(url, { signal: AbortSignal.timeout(120000) });
  if (!res.ok) throw new Error(`download ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 1000) throw new Error("downloaded reel too small");
  return buf;
}

// Captioning is async on the prompt service (whisper + ffmpeg outlast the HTTP
// request timeout): submit returns a job id; we poll it across ticks.
async function klingCaptionSubmit(url: string): Promise<string> {
  const res = await fetch(`${KLING_URL}/caption`, {
    method: "POST",
    headers: { Authorization: `Bearer ${KLING_SECRET}`, "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
    signal: AbortSignal.timeout(30000),
  });
  const text = await res.text();
  let data: any = {};
  try {
    data = JSON.parse(text);
  } catch {
    /* non-JSON error page */
  }
  if (!res.ok) throw new Error(data?.detail || `caption submit failed (${res.status}): ${text.slice(0, 100)}`);
  if (!data.job_id) throw new Error("caption submit returned no job_id");
  return data.job_id as string;
}

async function klingCaptionPoll(
  jobId: string
): Promise<{ status: string; key?: string; url?: string; error?: string }> {
  const res = await fetch(`${KLING_URL}/caption/${jobId}`, {
    headers: { Authorization: `Bearer ${KLING_SECRET}` },
    signal: AbortSignal.timeout(30000),
  });
  if (res.status === 404) return { status: "gone" };
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.detail || `caption poll failed (${res.status})`);
  return { status: data.status || "pending", key: data.key, url: data.url, error: data.error };
}

function dayStamp() {
  const t = new Date(Date.now() + 2 * 3600 * 1000); // Serbia (UTC+2)
  const p2 = (n: number) => String(n).padStart(2, "0");
  const day = `${t.getUTCFullYear()}-${p2(t.getUTCMonth() + 1)}-${p2(t.getUTCDate())}`;
  const stamp = `${day} ${p2(t.getUTCHours())}-${p2(t.getUTCMinutes())}`;
  return { day, stamp };
}

// Claim delivery (only one tick wins) then push to Drive. finalKey = the captioned
// Spaces copy, or the raw copy on fallback.
async function deliverFinal(job: any, finalKey: string, bytes: Buffer, captionError: string | null) {
  const claimed = await prisma.recreation.updateMany({
    where: { id: job.id, finalKey: null },
    data: { finalKey, captionJobId: null, stage: "Done" },
  });
  if (claimed.count === 0) return; // already delivered by another tick
  const { day, stamp } = dayStamp();
  let driveUrl: string | null = null;
  let driveError: string | null = null;
  try {
    driveUrl = await maybeUploadToDrive(`Poppy ${stamp}.mp4`, bytes, { subfolder: day });
  } catch (e) {
    driveError = e instanceof Error ? e.message : String(e);
  }
  await prisma.recreation.update({
    where: { id: job.id },
    data: { driveUrl, driveError: driveError || captionError },
  });
}

// Fallback: download the raw reel, keep an uncaptioned permanent copy, deliver.
async function deliverUncaptioned(job: any, videoUrl: string, captionError: string | null) {
  try {
    const bytes = await downloadReel(videoUrl);
    const finalKey = await putBuffer(`recreate/${job.id}-final.mp4`, bytes, "video/mp4");
    await deliverFinal(job, finalKey, bytes, captionError);
  } catch (e) {
    await prisma.recreation
      .updateMany({
        where: { id: job.id, finalKey: null },
        data: {
          captionJobId: null,
          stage: "Adding captions…",
          driveError: `save failed: ${e instanceof Error ? e.message : String(e)}`,
        },
      })
      .catch(() => {});
  }
}

// MOTION_WAIT → poll Motion-Control STATUS → on done: mark DONE (fast). The slow
// caption + Spaces copy + Drive delivery happens in a separate bounded pass
// (finalizeDone) so a long caption can't stall the tick or strand a reel on restart.
async function checkMotion(job: any) {
  if (!job.motionRecordId) return; // claimed to MOTION_WAIT but row not created yet
  const fields = await getRecord(AT_TABLES.MOTION, job.motionRecordId);
  const status = String(fields[AT_FIELDS.STATUS] || "").trim();
  if (/^error/i.test(status)) throw new Error(`Motion Control failed: ${status}`);
  if (status.toLowerCase() !== "done") return;
  const videoUrl = String(fields[AT_FIELDS.OUTPUT_URL] || "").trim();
  if (!videoUrl) return;

  // Atomic claim: MOTION_WAIT → DONE (winner only). finalVideoUrl = the RunningHub
  // URL so the reel plays immediately; finalKey stays null → picked up for delivery.
  await prisma.recreation.updateMany({
    where: { id: job.id, status: "MOTION_WAIT" },
    data: { status: "DONE", stage: "Adding captions…", finalVideoUrl: videoUrl },
  });
}

// DONE-but-not-delivered → auto-caption, store a permanent copy, deliver to Drive.
// Claimed atomically so overlapping ticks can't double-caption. Best-effort: on any
// failure the reel stays DONE (playable via the RunningHub URL) and we note why.
async function finalizeDone(job: any) {
  const videoUrl = job.finalVideoUrl as string;

  // Phase 1 — submit a caption job if we haven't yet. Atomic claim on captionJobId
  // so overlapping ticks can never double-submit.
  if (!job.captionJobId) {
    const claimed = await prisma.recreation.updateMany({
      where: { id: job.id, status: "DONE", finalKey: null, captionJobId: null },
      data: { captionJobId: "SUBMITTING", stage: "Adding captions…" },
    });
    if (claimed.count === 0) return; // another tick claimed it
    try {
      const jobId = await klingCaptionSubmit(videoUrl);
      await prisma.recreation.update({ where: { id: job.id }, data: { captionJobId: jobId } });
    } catch (e) {
      await deliverUncaptioned(job, videoUrl, `captions skipped: ${e instanceof Error ? e.message : String(e)}`);
    }
    return; // poll on the next tick
  }

  if (job.captionJobId === "SUBMITTING") return; // mid-submit — wait for the real id

  // Phase 2 — poll the caption job.
  let res: { status: string; key?: string; url?: string; error?: string };
  try {
    res = await klingCaptionPoll(job.captionJobId);
  } catch {
    return; // transient — retry next tick
  }
  if (res.status === "pending" || res.status === "processing") return; // still working

  if (res.status === "done" && res.key && res.url) {
    try {
      const bytes = await downloadReel(res.url);
      await deliverFinal(job, res.key, bytes, null);
    } catch (e) {
      await deliverUncaptioned(job, videoUrl, `captions skipped: ${e instanceof Error ? e.message : String(e)}`);
    }
    return;
  }

  // error, or the job was lost to a service restart → deliver uncaptioned. "no
  // speech" is normal for music/no-voiceover reels, so don't flag it as an error.
  const msg = res.error || res.status;
  const captionError = /no speech/i.test(msg) ? null : `captions skipped: ${msg}`;
  await deliverUncaptioned(job, videoUrl, captionError);
}

// Advance every in-flight job by one step. Safe to call repeatedly. New RunningHub
// tasks (image prep + motion submit) are only started while under MAX_INFLIGHT, so
// we never fire more concurrent renders than the account allows.
export async function tick(): Promise<{ prepped: number; imageChecked: number; motionChecked: number; submitted: number; finalized: number }> {
  // Self-heal: a reel stranded mid-download (PREPPING) — the prep step was cut
  // off (redeploy / DB blip) and left it orphaned. prep can't run longer than
  // ~2 min, so anything older is dead → return it to QUEUED to re-download.
  await prisma.recreation.updateMany({
    where: {
      status: "PREPPING",
      updatedAt: { lt: new Date(Date.now() - 5 * 60 * 1000) },
    },
    data: { status: "QUEUED", stage: "Queued" },
  });

  // Self-heal: a job claimed to MOTION_WAIT whose Motion-Control row never got
  // created (process died mid-handoff) → return it to IMAGE_DONE to re-submit.
  await prisma.recreation.updateMany({
    where: {
      status: "MOTION_WAIT",
      motionRecordId: null,
      updatedAt: { lt: new Date(Date.now() - 3 * 60 * 1000) },
    },
    data: { status: "IMAGE_DONE", stage: "Waiting for a render slot…" },
  });

  // Self-heal: a caption submit that died mid-flight (captionJobId stuck at the
  // "SUBMITTING" marker, no finalKey) → clear it so a later tick re-submits.
  await prisma.recreation.updateMany({
    where: {
      status: "DONE",
      finalKey: null,
      captionJobId: "SUBMITTING",
      updatedAt: { lt: new Date(Date.now() - 3 * 60 * 1000) },
    },
    data: { captionJobId: null },
  });

  let prepped = 0,
    imageChecked = 0,
    motionChecked = 0,
    submitted = 0,
    finalized = 0;

  // How many RunningHub tasks are running right now (image + motion). New work is
  // only started up to the remaining budget — this is the concurrency cap.
  const [imgRunning, motRunning] = await Promise.all([
    prisma.recreation.count({ where: { status: "IMAGE_WAIT" } }),
    prisma.recreation.count({ where: { status: "MOTION_WAIT" } }),
  ]);
  let budget = Math.max(0, MAX_INFLIGHT - imgRunning - motRunning);

  // Poll running image tasks (no new task — a completion frees a slot next tick).
  const imgWait = await prisma.recreation.findMany({ where: { status: "IMAGE_WAIT" }, take: 25 });
  for (const j of imgWait) {
    try {
      await checkImage(j);
      imageChecked++;
    } catch (e) {
      await failJob(j.id, e);
    }
  }

  // Prefer finishing started work: submit renders for image-done jobs first.
  if (budget > 0) {
    const ready = await prisma.recreation.findMany({
      where: { status: "IMAGE_DONE" },
      take: budget,
      orderBy: { createdAt: "asc" },
    });
    for (const j of ready) {
      try {
        await submitMotion(j);
        submitted++;
        budget--;
      } catch (e) {
        await failJob(j.id, e);
      }
    }
  }

  // Then start new reels (download + image-edit), within the remaining budget.
  if (budget > 0) {
    const queued = await prisma.recreation.findMany({
      where: { status: "QUEUED" },
      take: Math.min(budget, MAX_PREP_PER_TICK),
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
  }

  // Poll running motion tasks.
  const motWait = await prisma.recreation.findMany({ where: { status: "MOTION_WAIT" }, take: 25 });
  for (const j of motWait) {
    try {
      await checkMotion(j);
      motionChecked++;
    } catch (e) {
      await failJob(j.id, e);
    }
  }

  // Caption + deliver finished reels (bounded — captioning is slow). Each reel is
  // already DONE and playable; this just adds captions + the permanent/Drive copy.
  const toFinalize = await prisma.recreation.findMany({
    where: { status: "DONE", finalKey: null },
    take: MAX_CAPTION_PER_TICK,
    orderBy: { updatedAt: "asc" },
  });
  for (const j of toFinalize) {
    await finalizeDone(j); // handles its own errors
    finalized++;
  }

  return { prepped, imageChecked, motionChecked, submitted, finalized };
}

// Re-run a FAILED job. If the Poppy image already exists (the common case — the
// render failed), just re-queue the render; otherwise start over from scratch.
export async function retryJob(id: string) {
  const job = await prisma.recreation.findUnique({ where: { id } });
  if (!job || job.status !== "FAILED") return null;
  if (job.poppyImageUrl && job.reelKey) {
    return prisma.recreation.update({
      where: { id },
      data: { status: "IMAGE_DONE", stage: "Waiting for a render slot…", motionRecordId: null, error: null, driveError: null },
    });
  }
  return prisma.recreation.update({
    where: { id },
    data: { status: "QUEUED", stage: "Queued", error: null, imageRecordId: null, motionRecordId: null, poppyImageUrl: null },
  });
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
