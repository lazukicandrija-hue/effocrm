/**
 * Effortless CRM - Instagram Scraper
 * 
 * Standalone Playwright script that:
 * 1. Logs into Instagram with a bot account
 * 2. Visits each tracked account's profile & reels
 * 3. Scrapes followers, reel views, reel likes
 * 4. POSTs data to the CRM API
 * 
 * Usage:
 *   node scraper.js              # Run on hourly schedule (default)
 *   node scraper.js --once       # Run once and exit
 *   node scraper.js --login-only # Just login and save session (interactive)
 */

const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

// ============================================
// CONFIGURATION
// ============================================
const CONFIG = {
  IG_USERNAME: process.env.IG_USERNAME || "pheonyx637",
  IG_PASSWORD: process.env.IG_PASSWORD || "mB8eXrFQuo",
  CRM_URL: process.env.CRM_URL || "https://effortless-crm-vn4uw.ondigitalocean.app",
  SCRAPER_SECRET: process.env.SCRAPER_SECRET || "effortless-scraper-2026",
  ACCOUNTS: ["brooxpoppy", "poppybroooks", "xpoppybrooks", "poppybroo"],
  SESSION_FILE: path.join(__dirname, ".ig-session.json"),
  DELAY_BETWEEN_ACCOUNTS: 5000,
  PAGE_LOAD_WAIT: 4000,
  SCROLL_DELAY: 1500,
};

function log(level, msg, data = null) {
  const ts = new Date().toISOString();
  const pre = { info: "ℹ️", success: "✅", warn: "⚠️", error: "❌", scrape: "🔍" }[level] || "📋";
  console.log(`[${ts}] ${pre} ${msg}`);
  if (data) console.log(JSON.stringify(data, null, 2));
}

class InstagramScraper {
  constructor() { this.browser = null; this.context = null; this.page = null; }

  async init(headless = true) {
    log("info", `Launching browser (headless: ${headless})...`);
    this.browser = await chromium.launch({ headless, args: ["--no-sandbox"] });
    const storageState = fs.existsSync(CONFIG.SESSION_FILE)
      ? JSON.parse(fs.readFileSync(CONFIG.SESSION_FILE, "utf-8"))
      : undefined;
    this.context = await this.browser.newContext({
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      viewport: { width: 1920, height: 1080 },
      locale: "en-US",
      ...(storageState ? { storageState } : {}),
    });
    this.page = await this.context.newPage();
    await this.page.route("**/*.{mp4,webm,woff,woff2}", (r) => r.abort());
  }

  async login() {
    log("info", "Checking login status...");
    await this.page.goto("https://www.instagram.com/", { waitUntil: "domcontentloaded", timeout: 30000 });
    await this.page.waitForTimeout(5000);

    // Check if logged in
    let isLoggedIn = await this.page.evaluate(() =>
      !!document.querySelector('svg[aria-label="Home"]') ||
      !!document.querySelector('a[href*="/direct/"]') ||
      !!document.querySelector('svg[aria-label="Search"]')
    );
    if (isLoggedIn) { log("success", "Already logged in!"); await this.saveSession(); return true; }

    // Check for "Continue as X" flow
    const hasContinue = await this.page.evaluate(() =>
      document.body.innerText.includes("Continue")
    );
    if (hasContinue) {
      log("info", "Found 'Continue' flow, clicking...");
      // Click the first continue-like button/link
      try {
        await this.page.click("text=Continue", { timeout: 5000 });
        await this.page.waitForTimeout(5000);
        // May need password
        const pwField = await this.page.$('input[name="password"], input[type="password"]');
        if (pwField) {
          await pwField.fill(CONFIG.IG_PASSWORD);
          await this.page.waitForTimeout(300);
          const submit = await this.page.$('button[type="submit"]');
          if (submit) { await submit.click(); await this.page.waitForTimeout(8000); }
        }
      } catch (e) { log("warn", "Continue flow failed: " + e.message); }
    }

    // Re-check
    isLoggedIn = await this.page.evaluate(() =>
      !!document.querySelector('svg[aria-label="Home"]') ||
      !!document.querySelector('a[href*="/direct/"]')
    );
    if (isLoggedIn) { log("success", "Logged in via Continue!"); await this.saveSession(); return true; }

    // Standard login
    log("info", "Attempting standard login...");
    await this.page.goto("https://www.instagram.com/accounts/login/", { waitUntil: "domcontentloaded", timeout: 30000 });
    await this.page.waitForTimeout(5000);

    // Cookie consent
    try {
      for (const text of ["Allow all cookies", "Accept", "Allow essential and optional cookies", "Allow All Cookies"]) {
        const btn = await this.page.$(`button:has-text("${text}")`);
        if (btn) { await btn.click(); await this.page.waitForTimeout(2000); break; }
      }
    } catch (e) {}

    // Wait for form - IG uses name="email" and name="pass"
    try {
      await this.page.waitForSelector('input[name="email"], input[name="username"]', { timeout: 15000 });
    } catch (e) {
      log("error", "Login form not found. Run with --login-only in headed mode.");
      return false;
    }

    // Fill - try both field name variants
    const emailField = await this.page.$('input[name="email"]') || await this.page.$('input[name="username"]');
    const passField = await this.page.$('input[name="pass"]') || await this.page.$('input[name="password"]');
    if (emailField) await emailField.fill(CONFIG.IG_USERNAME);
    await this.page.waitForTimeout(500);
    if (passField) await passField.fill(CONFIG.IG_PASSWORD);
    await this.page.waitForTimeout(500);
    
    // Submit by pressing Enter in the password field  
    if (passField) await passField.press("Enter");
    await this.page.waitForTimeout(10000);

    // Check for 2FA
    const finalUrl = this.page.url();
    if (finalUrl.includes("two_step_verification") || finalUrl.includes("two_factor")) {
      log("warn", "⚠️ TWO-FACTOR AUTHENTICATION REQUIRED!");
      log("warn", "The account has 2FA enabled. You need to:");
      log("warn", "1. Run: node scraper.js --login-only");
      log("warn", "2. Enter the 2FA code in the browser window that opens");
      log("warn", "3. Session will be saved automatically");
      
      // If running interactively, wait for user to enter code
      if (!process.env.HEADLESS) {
        log("info", "Waiting 120 seconds for 2FA code entry...");
        await this.page.waitForTimeout(120000);
        
        // Check if 2FA was completed
        const afterUrl = this.page.url();
        if (!afterUrl.includes("two_step_verification") && !afterUrl.includes("two_factor") && !afterUrl.includes("/login")) {
          log("success", "2FA completed! Saving session...");
          
          // Handle dialogs
          for (const text of ["Save info", "Save Info", "Not Now", "Not now"]) {
            try {
              const btn = await this.page.$(`button:has-text("${text}")`);
              if (btn) { await btn.click(); await this.page.waitForTimeout(2000); }
            } catch (e) {}
          }
          
          await this.saveSession();
          return true;
        }
      }
      return false;
    }

    // Handle dialogs
    for (const text of ["Save info", "Save Info", "Not Now", "Not now"]) {
      try {
        const btn = await this.page.$(`button:has-text("${text}")`);
        if (btn) { await btn.click(); await this.page.waitForTimeout(2000); }
      } catch (e) {}
    }

    // Check if we're on the feed now (URL changed from /login/)
    const currentUrl = this.page.url();
    isLoggedIn = (!currentUrl.includes("/login") && !currentUrl.includes("/accounts/")) || await this.page.evaluate(() =>
      !!document.querySelector('svg[aria-label="Home"]') ||
      !!document.querySelector('a[href*="/direct/"]') ||
      !!document.querySelector('svg[aria-label="Search"]') ||
      !!document.querySelector('[aria-label="Home"]')
    );
    if (isLoggedIn) { log("success", "Login successful!"); await this.saveSession(); return true; }
    log("error", "Login failed. URL: " + currentUrl);
    return false;
  }

  async saveSession() {
    const state = await this.context.storageState();
    fs.writeFileSync(CONFIG.SESSION_FILE, JSON.stringify(state, null, 2));
    log("info", `Session saved (${state.cookies.length} cookies)`);
  }

  // Instagram navigation occasionally times out; retry a couple of times before giving up.
  async gotoWithRetry(url, attempts = 3) {
    for (let i = 1; i <= attempts; i++) {
      try {
        await this.page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
        return true;
      } catch (e) {
        log("warn", `goto failed (${i}/${attempts}) ${url}: ${e.message}`);
        if (i < attempts) await this.page.waitForTimeout(3000);
      }
    }
    return false;
  }

  async scrapeAccount(igUsername) {
    log("scrape", `Scraping @${igUsername}...`);
    const result = { igUsername, followers: 0, following: 0, postsCount: 0, reels: [] };

    try {
      if (!(await this.gotoWithRetry(`https://www.instagram.com/${igUsername}/`))) {
        log("error", `@${igUsername}: profile navigation failed after retries`);
        return result;
      }
      await this.page.waitForTimeout(CONFIG.PAGE_LOAD_WAIT);

      if (await this.page.evaluate(() => document.body.innerText.includes("Sorry, this page"))) {
        log("warn", `@${igUsername} not found!`); return null;
      }

      // Profile stats
      const stats = await this.page.evaluate(() => {
        const s = { followers: 0, following: 0, posts: 0 };
        function parseCount(str) {
          if (!str) return 0;
          str = str.replace(/,/g, "");
          if (str.match(/[Kk]$/)) return Math.round(parseFloat(str) * 1000);
          if (str.match(/[Mm]$/)) return Math.round(parseFloat(str) * 1000000);
          return parseInt(str) || 0;
        }
        // Meta tag
        const meta = document.querySelector('meta[name="description"]');
        if (meta) {
          const c = meta.getAttribute("content") || "";
          const fm = c.match(/([\d,.]+[KMkm]?)\s*Followers/i);
          const gm = c.match(/([\d,.]+[KMkm]?)\s*Following/i);
          const pm = c.match(/([\d,.]+[KMkm]?)\s*Posts/i);
          if (fm) s.followers = parseCount(fm[1]);
          if (gm) s.following = parseCount(gm[1]);
          if (pm) s.posts = parseCount(pm[1]);
        }
        // Fallback: header li elements
        if (s.followers === 0) {
          const lis = document.querySelectorAll("header li, header section li");
          lis.forEach(li => {
            const t = li.innerText;
            const n = t.match(/([\d,.]+[KMkm]?)/);
            if (n) {
              const num = parseCount(n[1]);
              if (t.toLowerCase().includes("follower")) s.followers = num;
              else if (t.toLowerCase().includes("following")) s.following = num;
              else if (t.toLowerCase().includes("post")) s.posts = num;
            }
          });
        }
        // Exact count from title attributes
        document.querySelectorAll("span[title]").forEach(span => {
          const title = span.getAttribute("title");
          const parent = span.closest("li");
          if (parent && title) {
            const num = parseInt(title.replace(/,/g, ""));
            const pt = parent.innerText.toLowerCase();
            if (pt.includes("follower")) s.followers = num;
          }
        });
        return s;
      });
      Object.assign(result, { followers: stats.followers, following: stats.following, postsCount: stats.posts });
      log("info", `@${igUsername}: ${result.followers} followers`);

      // Reels page
      if (!(await this.gotoWithRetry(`https://www.instagram.com/${igUsername}/reels/`))) {
        log("error", `@${igUsername}: reels navigation failed after retries`);
        return result;
      }
      await this.page.waitForTimeout(CONFIG.PAGE_LOAD_WAIT);

      // Wait for the reels grid to render before scrolling
      try {
        await this.page.waitForSelector('a[href*="/reel/"]', { timeout: 15000 });
      } catch {
        log("warn", `@${igUsername}: no reels appeared in grid`);
      }

      // Scroll to load all reels (don't stop until the count is stable AND non-zero)
      let prev = 0, stableRounds = 0;
      for (let i = 0; i < 12; i++) {
        await this.page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await this.page.waitForTimeout(CONFIG.SCROLL_DELAY);
        const cur = await this.page.evaluate(() => document.querySelectorAll('a[href*="/reel/"]').length);
        if (cur === prev) {
          if (cur > 0 && ++stableRounds >= 2) break;
        } else {
          stableRounds = 0;
        }
        prev = cur;
      }

      // Collect all reel data straight from the grid overlay.
      // Each reel link renders likes, comments and views as <span>s, and IG
      // duplicates every value, so the spans come through as pairs:
      //   [likes, likes, comments, comments, views, views]
      // The thumbnail is a background-image on a child div (no <img> tag).
      const reelLinks = await this.page.evaluate(() => {
        function parseCount(str) {
          if (!str) return 0;
          str = str.replace(/,/g, "").trim();
          if (str.match(/[Kk]$/)) return Math.round(parseFloat(str) * 1000);
          if (str.match(/[Mm]$/)) return Math.round(parseFloat(str) * 1000000);
          return parseInt(str) || 0;
        }
        const items = [];
        const seen = new Set();
        document.querySelectorAll('a[href*="/reel/"]').forEach(link => {
          const m = (link.getAttribute("href") || "").match(/\/reel\/([^/]+)/);
          if (!m || seen.has(m[1])) return;
          seen.add(m[1]);

          // Thumbnail: prefer <img>, fall back to a background-image url
          let thumbnailUrl = link.querySelector("img")?.getAttribute("src") || null;
          if (!thumbnailUrl) {
            const bgEl = link.querySelector('[style*="background-image"]');
            const bg = bgEl?.getAttribute("style") || "";
            const bm = bg.match(/background-image:\s*url\(["']?([^"')]+)["']?\)/);
            if (bm) thumbnailUrl = bm[1].replace(/&amp;/g, "&");
          }

          // Stats: take every other span (values are duplicated) -> [likes, comments, views]
          const spans = [...link.querySelectorAll("span")]
            .map(s => s.innerText.trim())
            .filter(Boolean);
          const stats = spans.filter((_, i) => i % 2 === 0).map(parseCount);
          let likes = 0, comments = 0, views = 0;
          if (stats.length >= 3) {
            likes = stats[0];
            comments = stats[1];
            views = Math.max(...stats); // views is always the largest of the three
          } else if (stats.length) {
            views = Math.max(...stats);
          }

          items.push({ shortcode: m[1], thumbnailUrl, likes, comments, views });
        });
        return items;
      });

      const thumbCount = reelLinks.filter(r => r.thumbnailUrl).length;
      const viewsCount = reelLinks.filter(r => r.views > 0).length;
      log("info", `@${igUsername}: ${reelLinks.length} reels in grid (${thumbCount} thumbnails, ${viewsCount} with views)`);

      for (const rl of reelLinks) {
        result.reels.push({
          shortcode: rl.shortcode,
          views: rl.views || 0,
          likes: rl.likes || 0,
          comments: rl.comments || 0,
          thumbnailUrl: rl.thumbnailUrl || null,
        });
      }

      log("success", `@${igUsername}: ${result.reels.length} reels scraped with detailed stats`);
    } catch (error) {
      log("error", `Failed @${igUsername}: ${error.message}`);
    }
    return result;
  }

  async syncToCRM(data) {
    log("info", `Syncing ${data.length} accounts to CRM...`);
    try {
      const res = await fetch(`${CONFIG.CRM_URL}/api/scraper/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${CONFIG.SCRAPER_SECRET}` },
        body: JSON.stringify({ accounts: data }),
      });
      if (!res.ok) { log("error", `CRM sync failed: ${res.status}`); return false; }
      const result = await res.json();
      log("success", "CRM sync complete!", result);
      return true;
    } catch (error) {
      log("error", `CRM sync error: ${error.message}`);
      return false;
    }
  }

  async runOnce() {
    const isLoginOnly = process.argv.includes("--login-only");
    try {
      await this.init(!isLoginOnly); // headed for login-only
      const ok = await this.login();
      if (!ok) { log("error", "Login failed!"); return; }
      if (isLoginOnly) { log("success", "Session saved. You can now run headless."); return; }

      const results = [];
      for (const u of CONFIG.ACCOUNTS) {
        const r = await this.scrapeAccount(u);
        if (r) results.push(r);
        await this.page.waitForTimeout(CONFIG.DELAY_BETWEEN_ACCOUNTS);
      }
      log("info", `Scraped ${results.length}/${CONFIG.ACCOUNTS.length} accounts`);
      if (results.length > 0) await this.syncToCRM(results);
      await this.saveSession();
    } catch (error) {
      log("error", `Scraper error: ${error.message}`);
    } finally {
      if (this.browser) await this.browser.close();
    }
  }

  async runScheduled(ms = 3600000) {
    log("info", `Scheduled mode (every ${ms/60000} min)`);
    while (true) {
      await this.runOnce();
      log("info", `Next run in ${ms/60000} minutes...`);
      await new Promise(r => setTimeout(r, ms));
      this.browser = null; this.context = null; this.page = null;
    }
  }
}

async function main() {
  const scraper = new InstagramScraper();
  if (process.argv.includes("--once") || process.argv.includes("--login-only")) {
    await scraper.runOnce();
  } else {
    await scraper.runScheduled(parseInt(process.env.SCRAPE_INTERVAL || "3600000"));
  }
}
main().catch(e => { log("error", `Fatal: ${e.message}`); process.exit(1); });
