// First Frame → Poppy: server-side finalization of persisted jobs, run on the 24/7
// tick loop so a finished image-edit comes back even with the page closed.
//
// READ-only on Airtable (getRecord); writes only its own rows + Spaces. The DONE
// transition is an atomic claim, so two instances never double-finalize a job.
import prisma from "./prisma";
import { getRecord, AT_TABLES, AT_FIELDS } from "./airtable";
import { putBuffer } from "./spaces";

const MAX_ADVANCE = 5; // jobs finalized per tick
const STUCK_MS = 25 * 60 * 1000; // fail a job stuck WORKING this long (queue can be busy)

export async function advancePoppyFrames(): Promise<number> {
  const jobs = await prisma.poppyFrame.findMany({
    where: { status: "WORKING" },
    orderBy: { createdAt: "asc" },
    take: MAX_ADVANCE,
  });
  let done = 0;
  for (const job of jobs) {
    try {
      const fields = await getRecord(AT_TABLES.IMAGE_EDIT, job.imageRecordId);
      const status = String(fields[AT_FIELDS.STATUS] || "").trim();
      if (/^error/i.test(status)) {
        await fail(job.id, status.slice(0, 400));
        continue;
      }
      if (status.toLowerCase() !== "done") {
        if (Date.now() - new Date(job.createdAt).getTime() > STUCK_MS) {
          await fail(job.id, "Timed out waiting for the image-edit to finish.");
        }
        continue; // still running
      }
      const outUrl = String(fields[AT_FIELDS.OUTPUT_URL] || "").trim();
      if (!outUrl) continue; // done but URL not written yet — next tick

      // Copy the Poppy image into Spaces (CORS-friendly, permanent). Deterministic
      // key → a duplicate tick just overwrites the same object.
      const res = await fetch(outUrl, { signal: AbortSignal.timeout(60000) });
      if (!res.ok) continue; // transient — retry next tick
      const buf = Buffer.from(await res.arrayBuffer());
      const type = res.headers.get("content-type") || "image/jpeg";
      const ext = type.includes("png") ? "png" : "jpg";
      const key = `poppy-frames/out-${job.imageRecordId}.${ext}`;
      await putBuffer(key, buf, type);

      const claimed = await prisma.poppyFrame.updateMany({
        where: { id: job.id, status: "WORKING" },
        data: { status: "DONE", resultKey: key },
      });
      if (claimed.count > 0) done++;
    } catch {
      /* leave WORKING; retry next tick */
    }
  }
  return done;
}

async function fail(id: string, error: string) {
  await prisma.poppyFrame
    .updateMany({ where: { id, status: "WORKING" }, data: { status: "FAILED", error } })
    .catch(() => {});
}
