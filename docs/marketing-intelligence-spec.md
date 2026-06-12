# Effortless CRM — Marketing Intelligence System
**Build spec · v1**

Turn the CRM from a *tracker* into a *growth engine*: it already scrapes reel performance, so use that to surface what's working and auto-generate marketing ideas with ready-to-paste **Seedance** prompts.

```
[Scraper] → Reel / ReelSnapshot / DailyStat   (exists)
   │
   ▼
1. PERFORMANCE SCORER   rank by views + velocity + over-performance vs the account's baseline
   │
   ▼
2. CONTENT ANALYZER     read each TOP reel (caption + Seedance vision read) → hook / theme / format tags
   │
   ▼
3. PATTERN ENGINE       "Golf + back-to-camera + reveal = 5× baseline this week"
   │
   ▼
4. IDEA GENERATOR (LLM) (a) recreate winners  +  (b) novel concepts from the patterns
   │
   ▼
5. PROMPT BRIDGE → Seedance engine   every idea gets a paste-ready prompt
   │
   ▼
[CRM]  "What's Working" tab  +  "Ideas" tab (My Ideas / AI Ideas)
```

## Decisions locked
1. **Engine** = the Seedance web prompter (`kling-video-to-prompt` app), wrapped as an API.
2. **Sources** = our own accounts **+ competitor accounts** (added by IG handle, scraped + analyzed).
3. **Cadence** = weekly auto-digest **+** on-demand "ideas now".
4. **Ideas** live in a **new, separate "Ideas" tab**: *My Ideas* (manual) + *AI Ideas* (generated). Flexible/adjustable.
5. **Scraper** = light **daily** scheduled run on the VPS + keep on-refresh. (Not hourly/24-7 — daily is enough for weekly trends and far safer for the IG account.)

---

## 1. Data-model changes (Prisma)

```prisma
// a. Distinguish our accounts from tracked rivals; allow competitor accounts not tied to a Model
enum Ownership { OWN COMPETITOR }

model Account {
  // ...existing...
  ownership Ownership @default(OWN)
  modelId   String?   // was required — make optional so competitor accounts need no Model
}

// b. Cached content understanding per reel (computed once, only for top reels)
model ReelAnalysis {
  id         String   @id @default(cuid())
  reelId     String   @unique
  reel       Reel     @relation(fields: [reelId], references: [id], onDelete: Cascade)
  hook       String?              // the opening hook
  themes     String[] @default([]) // ["golf","reveal","talking-to-camera","POV"]
  format     String?              // "swing reveal" | "talking" | "POV" | ...
  summary    String?  @db.Text    // one-line what-happens (from the Seedance description)
  prompt     String?  @db.Text    // cached recreate prompt
  analyzedAt DateTime @default(now())
}
// + add `analysis ReelAnalysis?` to Reel

// c. The Ideas section
enum IdeaSource { MANUAL AI }
enum IdeaStatus { NEW SAVED IN_PROGRESS DONE DISMISSED }

model Idea {
  id           String     @id @default(cuid())
  source       IdeaSource @default(AI)
  title        String
  concept      String?    @db.Text   // description / why it'll work
  prompt       String?    @db.Text   // ready-to-use Seedance prompt
  sourceReelId String?               // for "recreate" ideas: the winning reel
  sourceReel   Reel?      @relation(fields: [sourceReelId], references: [id], onDelete: SetNull)
  modelId      String?               // which of our models it's for
  status       IdeaStatus @default(NEW)
  createdAt    DateTime   @default(now())
  updatedAt    DateTime   @updatedAt
}
```
All additive → `prisma db push` applies safely (no data loss).

---

## 2. Intelligence pipeline

**2.1 Performance scorer** *(pure data, Phase 1)* — per reel from `ReelSnapshot` deltas:
- `viewsGained7d` = currentViews − views ~7 days ago
- `velocity` = viewsGained7d ÷ days tracked
- `baseline` = median currentViews of that account's reels
- `overIndex` = currentViews ÷ baseline  *(beats the account's own norm)*
- `score` = weighted blend favoring recent + over-indexing + still-accelerating
- Output: ranked Top Performers (per account / per model / global / competitors).

**2.2 Content analyzer** *(Phase 2)* — for top *N* reels/week lacking a `ReelAnalysis`:
- Seedance engine API → description → LLM extracts hook / themes / format / summary → cache in `ReelAnalysis` (+ recreate prompt). Auto-upgrades manual `niche` tags.

**2.3 Pattern engine** *(Phase 3)* — group by theme/format/ownership, compare avg performance vs baseline → "[theme] over-indexed N× this week", "competitor X's [format] is rising", "[theme] is cooling".

**2.4 Idea generator (LLM)** *(Phase 2/3)* — inputs: top performers + analysis + patterns + competitor signals. Produces both:
- **Recreate**: remake a winner → linked `sourceReel` + recreate prompt.
- **Novel**: fresh concepts fitting the winning patterns → concept + generated prompt.
- Written as `Idea` rows (source=AI). Grounded in *your* data, not generic.

---

## 3. The Seedance API bridge *(the one new piece of infra)*
The engine is Python; the CRM is Next.js — so expose the pipeline as an API:
- `POST /api/analyze  { url }`  →  `{ prompt, description, firstFrameUrl? }`
- Reuses `analysis.py` (yt-dlp download + TwelveLabs/Whisper/OpenRouter → prompt); IG download already handled via the proxy + cookie.
- Auth via a shared secret. Deploy as a small FastAPI service (or an API route on the existing app).
- CRM calls it for (a) one-click recreate-prompt, (b) batch prompts for AI ideas.

---

## 4. CRM UI
- **"What's Working"** (Phase 1): ranked top/accelerating reels (own + competitor), stats + tags + one-click **Get recreate prompt** (calls the API; shows/copies; optionally saves as an Idea).
- **"Ideas"** (new, Phase 2): two sub-tabs — **My Ideas** (manual add) + **AI Ideas** (generated). Idea card = title, concept, ready prompt (copy), source reel, assign-to-model, status. **Generate ideas now** button + the weekly digest auto-populates AI Ideas.
- **Accounts** (extend): add competitor accounts with the Own/Competitor flag → they get scraped + analyzed.

---

## 5. Scraper schedule *(foundation)*
- Keep the existing on-refresh (`--if-requested`) flow.
- Add a **daily** run on the VPS (`node scraper.js --once`, once or twice/day via cron or a systemd timer) — enough snapshots for weekly trends, gentle on the IG account.
- Scrapes own + competitor accounts → `Reel`/`ReelSnapshot`/`DailyStat` accumulate → the brain has fuel.
- ⚠️ Requires VPS access to configure (blocked previously when the agent guessed the IP — needs explicit authorization).

---

## 6. Phased roadmap
| Phase | Delivers | Main work |
|---|---|---|
| **1** | "What's Working" + one-click recreate prompts | Performance scorer (existing data) · **Seedance API bridge** · daily scraper on VPS |
| **2** | Content auto-tagging + Ideas tab + weekly digest | `ReelAnalysis` · `Idea` model + UI · LLM idea gen (recreate + novel) · on-demand "generate" |
| **3** | Smart patterns + competitor intelligence | Pattern engine (theme × performance, trends, "what to stop") · sharper idea gen |

## 7. Cost & ops
- Vision analysis costs per reel → only analyze **top** reels (a handful/week), cached in `ReelAnalysis`. Cheap.
- LLM idea generation = a few calls/week. Cheap.
- Daily scrape = gentle on IG + proxy bandwidth.
- DB: a few small tables, modest growth.

## 8. Open items / risks
- **VPS access** for the daily scrape (needs authorization).
- `Account.modelId` becomes optional (for competitors) — additive migration, safe.
- Seedance-as-API: pick deploy (small new service vs route on the existing app).
- Recreate prompts re-download the reel (yt-dlp) — fine for recent; very old reels may be gone.
- Whole system runs on scrape data — the daily scraper is the prerequisite for everything else.
