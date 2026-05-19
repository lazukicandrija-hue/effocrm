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

  async scrapeAccount(igUsername) {
    log("scrape", `Scraping @${igUsername}...`);
    const result = { igUsername, followers: 0, following: 0, postsCount: 0, reels: [] };

    try {
      await this.page.goto(`https://www.instagram.com/${igUsername}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
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
      await this.page.goto(`https://www.instagram.com/${igUsername}/reels/`, { waitUntil: "domcontentloaded", timeout: 30000 });
      await this.page.waitForTimeout(CONFIG.PAGE_LOAD_WAIT);

      // Scroll to load reels
      let prev = 0;
      for (let i = 0; i < 8; i++) {
        await this.page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await this.page.waitForTimeout(CONFIG.SCROLL_DELAY);
        const cur = await this.page.evaluate(() => document.querySelectorAll('a[href*="/reel/"]').length);
        if (cur === prev) break;
        prev = cur;
      }

      // Collect all reel shortcodes + thumbnails from grid
      const reelLinks = await this.page.evaluate(() => {
        const items = [];
        document.querySelectorAll('a[href*="/reel/"]').forEach(link => {
          const m = (link.getAttribute("href") || "").match(/\/reel\/([^/]+)/);
          if (!m) return;
          // Avoid duplicates
          if (items.some(r => r.shortcode === m[1])) return;
          const img = link.querySelector("img");
          // Try to get views from grid overlay
          let gridViews = 0;
          link.querySelectorAll("span").forEach(span => {
            const text = span.innerText.trim().replace(/,/g, "");
            if (!text || text.length > 15) return;
            let num = 0;
            if (text.match(/[Kk]$/)) num = Math.round(parseFloat(text) * 1000);
            else if (text.match(/[Mm]$/)) num = Math.round(parseFloat(text) * 1000000);
            else num = parseInt(text) || 0;
            if (num > 0 && gridViews === 0) gridViews = num;
          });
          items.push({
            shortcode: m[1],
            thumbnailUrl: img?.getAttribute("src") || null,
            gridViews,
          });
        });
        return items;
      });
      log("info", `@${igUsername}: found ${reelLinks.length} reels in grid, visiting each...`);

      // Fetch thumbnails via HTTP (non-authenticated gets og:image meta tags)
      const THUMB_BATCH = 5;
      for (let i = 0; i < reelLinks.length; i += THUMB_BATCH) {
        const batch = reelLinks.slice(i, i + THUMB_BATCH);
        await Promise.all(batch.map(async (rl) => {
          try {
            const res = await fetch(`https://www.instagram.com/reel/${rl.shortcode}/`, {
              headers: { "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" },
              redirect: "follow",
            });
            const html = await res.text();
            const ogMatch = html.match(/property="og:image"\s+content="([^"]+)"/);
            if (ogMatch) {
              rl.thumbnailUrl = ogMatch[1].replace(/&amp;/g, "&");
            }
          } catch {}
        }));
      }
      const thumbCount = reelLinks.filter(r => r.thumbnailUrl).length;
      log("info", `@${igUsername}: fetched ${thumbCount}/${reelLinks.length} thumbnails`);


      // Visit each reel page for exact views + likes
      for (const rl of reelLinks) {
        try {
          await this.page.goto(`https://www.instagram.com/reel/${rl.shortcode}/`, {
            waitUntil: "domcontentloaded", timeout: 20000,
          });
          await this.page.waitForTimeout(2000);

          const reelData = await this.page.evaluate(() => {
            function parseNum(str) {
              if (!str) return 0;
              str = str.replace(/,/g, "").trim();
              if (str.match(/[Kk]$/)) return Math.round(parseFloat(str) * 1000);
              if (str.match(/[Mm]$/)) return Math.round(parseFloat(str) * 1000000);
              return parseInt(str) || 0;
            }
            let views = 0, likes = 0;
            let thumbnail = null;

            // Get og:image for thumbnail (most reliable source)
            const ogImg = document.querySelector('meta[property="og:image"]');
            if (ogImg) thumbnail = ogImg.getAttribute("content");

            // Also try video poster
            if (!thumbnail) {
              const video = document.querySelector("video[poster]");
              if (video) thumbnail = video.getAttribute("poster");
            }

            // Method 1: Look for "X plays" or "X likes" text
            document.querySelectorAll("span").forEach(span => {
              const text = span.innerText.trim();
              if (text.match(/plays$/i)) {
                views = parseNum(text.replace(/\s*plays$/i, ""));
              }
              if (text.match(/likes?$/i) && !text.match(/\d+\s*likes?\s*,/)) {
                likes = parseNum(text.replace(/\s*likes?$/i, ""));
              }
            });

            // Method 2: meta tag og:description
            if (views === 0) {
              const meta = document.querySelector('meta[property="og:description"]');
              if (meta) {
                const content = meta.getAttribute("content") || "";
                const vm = content.match(/([\d,.]+[KMkm]?)\s*(?:plays|views|Plays|Views)/i);
                const lm = content.match(/([\d,.]+[KMkm]?)\s*(?:likes?|Likes?)/i);
                if (vm) views = parseNum(vm[1]);
                if (lm) likes = parseNum(lm[1]);
              }
            }

            // Method 3: aria-labels
            if (views === 0) {
              document.querySelectorAll('[aria-label]').forEach(el => {
                const label = el.getAttribute("aria-label") || "";
                const vm = label.match(/([\d,.]+[KMkm]?)\s*(?:plays|views)/i);
                const lm = label.match(/([\d,.]+[KMkm]?)\s*(?:likes?)/i);
                if (vm && views === 0) views = parseNum(vm[1]);
                if (lm && likes === 0) likes = parseNum(lm[1]);
              });
            }

            // Method 4: section with numbers (fallback) - deduplicate
            if (views === 0) {
              const allSpans = document.querySelectorAll("section span, article span");
              const nums = [];
              allSpans.forEach(span => {
                const text = span.innerText.trim();
                if (text && text.match(/^[\d,.]+[KMkm]?$/) && text.length < 15) {
                  const n = parseNum(text);
                  if (n > 0 && !nums.includes(n)) nums.push(n);
                }
              });
              if (nums.length >= 1) views = nums[0];
              if (nums.length >= 2) likes = nums[1];
            }

            // Safety: if likes === views, reset likes to 0 (parsing error)
            if (likes === views && views > 0) likes = 0;

            return { views, likes, thumbnail };
          });

          result.reels.push({
            shortcode: rl.shortcode,
            views: reelData.views || rl.gridViews || 0,
            likes: reelData.likes || 0,
            thumbnailUrl: reelData.thumbnail || rl.thumbnailUrl,
          });

          if (result.reels.length % 10 === 0) {
            log("info", `  ... ${result.reels.length}/${reelLinks.length} reels done`);
          }

          // Small delay to not trigger rate limits
          await this.page.waitForTimeout(1000);
        } catch (err) {
          // If individual reel fails, still add with grid data
          result.reels.push({
            shortcode: rl.shortcode,
            views: rl.gridViews || 0,
            likes: 0,
            thumbnailUrl: rl.thumbnailUrl,
          });
        }
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
