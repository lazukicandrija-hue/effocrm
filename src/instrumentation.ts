// Runs once when the Next.js server boots. Starts an in-process loop that pings
// the Auto-Recreate tick endpoint every 45s, so queued jobs advance to a finished
// reel even when nobody has the Auto-Recreate tab open — i.e. fully hands-off.
//
// It only uses global fetch (no Node-only imports) so it compiles for every
// runtime; the actual pipeline work happens inside the tick API route. The page
// still ticks while open (a fallback), and every stage transition is an atomic
// claim, so overlapping drivers can never double-render.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  const base = (process.env.NEXTAUTH_URL || "").replace(/\/$/, "");
  const secret = process.env.SCRAPER_SECRET || "effortless-scraper-2026";
  if (!base) {
    console.warn("[auto-recreate] NEXTAUTH_URL unset — hands-off tick loop disabled");
    return;
  }

  const INTERVAL_MS = 45_000;
  let running = false;
  const run = async () => {
    if (running) return; // don't overlap a slow tick with the next timer
    running = true;
    try {
      await fetch(`${base}/api/recreations/tick`, {
        method: "POST",
        headers: { Authorization: `Bearer ${secret}` },
      });
    } catch (e) {
      console.error("[auto-recreate] tick error:", e instanceof Error ? e.message : e);
    } finally {
      running = false;
    }
  };

  setInterval(run, INTERVAL_MS);
  console.log("[auto-recreate] hands-off tick loop started (every 45s)");
}
