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
  // IG login is loaded via loadIgAccount() from env or a gitignored ig-account.json
  CRM_URL: process.env.CRM_URL || "https://effortless-crm-vn4uw.ondigitalocean.app",
  SCRAPER_SECRET: process.env.SCRAPER_SECRET || "effortless-scraper-2026",
  // Fallback only — used if the CRM account list can't be fetched. Normally the
  // scraper pulls EVERY account that has an IG username from the CRM Accounts tab.
  FALLBACK_ACCOUNTS: ["brooxpoppy", "poppybroooks", "xpoppybrooks", "poppybroo"],
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

// Optional proxy. Instagram blocks datacenter IPs, so on a VPS you should route
// through a residential/ISP proxy with a STICKY (non-rotating) IP. Configure it
// either via env (PROXY_SERVER / PROXY_USERNAME / PROXY_PASSWORD) or a gitignored
// proxy.json next to this file:  { "server": "host:port", "username": "...", "password": "..." }
function loadProxy() {
  if (process.env.PROXY_SERVER) {
    return {
      server: process.env.PROXY_SERVER,
      username: process.env.PROXY_USERNAME || undefined,
      password: process.env.PROXY_PASSWORD || undefined,
    };
  }
  const f = path.join(__dirname, "proxy.json");
  if (fs.existsSync(f)) {
    try {
      const j = JSON.parse(fs.readFileSync(f, "utf-8"));
      if (j && j.server) {
        return { server: j.server, username: j.username, password: j.password };
      }
    } catch (e) {
      log("warn", `proxy.json present but unreadable: ${e.message}`);
    }
  }
  return null;
}

// Instagram login for the scraper's "viewer" account. Read from env
// (IG_USERNAME / IG_PASSWORD) or a gitignored ig-account.json next to this file:
//   { "username": "...", "password": "..." }
// Kept out of the repo on purpose — never hard-code real credentials here.
function loadIgAccount() {
  if (process.env.IG_USERNAME && process.env.IG_PASSWORD) {
    return { username: process.env.IG_USERNAME, password: process.env.IG_PASSWORD };
  }
  const f = path.join(__dirname, "ig-account.json");
  if (fs.existsSync(f)) {
    try {
      const j = JSON.parse(fs.readFileSync(f, "utf-8"));
      if (j && j.username && j.password) {
        return { username: j.username, password: j.password };
      }
    } catch (e) {
      log("warn", `ig-account.json present but unreadable: ${e.message}`);
    }
  }
  return null;
}

class InstagramScraper {
  constructor() { this.browser = null; this.context = null; this.page = null; }

  async init(headless = true) {
    log("info", `Launching browser (headless: ${headless})...`);
    const launchOpts = { headless, args: ["--no-sandbox"] };
    const proxy = loadProxy();
    if (proxy) {
      let server = String(proxy.server).trim();
      if (!/^\w+:\/\//.test(server)) server = "http://" + server; // default to http://
      launchOpts.proxy = { server, username: proxy.username, password: proxy.password };
      log("info", `Routing traffic through proxy: ${server}`);
    } else {
      log("warn", "No proxy configured — Instagram often blocks datacenter/VPS IPs. Set proxy.json or PROXY_SERVER.");
    }
    this.browser = await chromium.launch(launchOpts);
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
    // Block heavy resources to save proxy bandwidth — we read all data from
    // Instagram's JSON API (xhr/fetch), never from images/video/fonts. Filter by
    // resource TYPE (robust against query-string URLs) and keep css/js/xhr/fetch.
    await this.page.route("**/*", (route) => {
      const type = route.request().resourceType();
      if (type === "image" || type === "media" || type === "font") return route.abort();
      return route.continue();
    });
  }

  async login() {
    log("info", "Checking login status...");
    if (!(await this.gotoWithRetry("https://www.instagram.com/"))) {
      log("error", "Could not reach instagram.com after retries; skipping this run");
      return false;
    }
    await this.page.waitForTimeout(5000);

    // Check if logged in
    let isLoggedIn = await this.page.evaluate(() =>
      !!document.querySelector('svg[aria-label="Home"]') ||
      !!document.querySelector('a[href*="/direct/"]') ||
      !!document.querySelector('svg[aria-label="Search"]')
    );
    if (isLoggedIn) { log("success", "Already logged in!"); await this.saveSession(); return true; }

    // Not logged in via a saved session — we need credentials from here on.
    const creds = loadIgAccount();
    if (!creds) {
      log("error", "Not logged in and no credentials configured — create ig-account.json (or set IG_USERNAME / IG_PASSWORD).");
      return false;
    }

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
          await pwField.fill(creds.password);
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
    if (!(await this.gotoWithRetry("https://www.instagram.com/accounts/login/"))) {
      log("error", "Could not reach the login page after retries; skipping this run");
      return false;
    }
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
    if (emailField) await emailField.fill(creds.username);
    await this.page.waitForTimeout(500);
    if (passField) await passField.fill(creds.password);
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
      // Land on the profile so the fetch below runs from the instagram.com
      // origin with the logged-in cookies (same-origin, no CORS issues).
      if (!(await this.gotoWithRetry(`https://www.instagram.com/${igUsername}/`))) {
        log("error", `@${igUsername}: profile navigation failed after retries`);
        return result;
      }
      await this.page.waitForTimeout(1500);

      // Two same-origin authenticated calls (the same ones the IG website makes):
      //   1. web_profile_info  -> exact follower/following/post counts + user id
      //   2. feed/user/{id}    -> the recent media with EXACT play_count
      //      (web_profile_info no longer returns media nodes; it only gives the
      //       post count, so the feed endpoint is needed for per-reel views.)
      const payload = await this.page.evaluate(async (username) => {
        const APP_ID = "936619743392459";
        try {
          const r1 = await fetch(
            `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`,
            { headers: { "x-ig-app-id": APP_ID }, credentials: "include" }
          );
          if (!r1.ok) return { error: `web_profile_info HTTP ${r1.status}` };
          const j1 = await r1.json();
          const user = j1?.data?.user;
          if (!user) return { error: "no user in profile response" };

          const out = {
            followers: user.edge_followed_by?.count ?? 0,
            following: user.edge_follow?.count ?? 0,
            postsCount: user.edge_owner_to_timeline_media?.count ?? 0,
            reels: [],
          };

          const r2 = await fetch(
            `https://www.instagram.com/api/v1/feed/user/${user.id}/?count=12`,
            { headers: { "x-ig-app-id": APP_ID }, credentials: "include" }
          );
          if (r2.ok) {
            const j2 = await r2.json();
            for (const raw of j2?.items || []) {
              const it = raw?.media || raw;
              // media_type 2 = video; clips product_type = reel. Skip images/carousels.
              const isReel = it.media_type === 2 || it.product_type === "clips";
              if (!isReel || !it.code) continue;
              out.reels.push({
                shortcode: it.code,
                views: it.play_count ?? it.ig_play_count ?? 0,
                likes: it.like_count ?? 0,
                comments: it.comment_count ?? 0,
                thumbnailUrl: it.image_versions2?.candidates?.[0]?.url || null,
                publishedAt: it.taken_at ? new Date(it.taken_at * 1000).toISOString() : null,
              });
            }
          } else {
            out.feedError = `feed HTTP ${r2.status}`;
          }
          return out;
        } catch (e) {
          return { error: String(e) };
        }
      }, igUsername);

      if (payload?.error) {
        log("error", `@${igUsername}: ${payload.error}`);
        return result;
      }

      result.followers = payload.followers;
      result.following = payload.following;
      result.postsCount = payload.postsCount;
      result.reels = payload.reels || [];
      log("info", `@${igUsername}: ${result.followers} followers (exact)`);
      if (payload.feedError) log("warn", `@${igUsername}: ${payload.feedError}`);

      log("success", `@${igUsername}: ${result.reels.length} reels scraped with exact stats`);
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

  // Pull the live account list from the CRM Accounts tab — every account that
  // has an IG username set. Falls back to FALLBACK_ACCOUNTS if the CRM can't be
  // reached, so a network blip never leaves the run with nothing to scrape.
  async fetchAccounts() {
    try {
      const res = await fetch(`${CONFIG.CRM_URL}/api/scraper/sync`, {
        headers: { Authorization: `Bearer ${CONFIG.SCRAPER_SECRET}` },
      });
      if (!res.ok) {
        log("warn", `Couldn't fetch CRM account list (HTTP ${res.status}); using fallback list`);
        return CONFIG.FALLBACK_ACCOUNTS;
      }
      const data = await res.json();
      const list = (data.accounts || [])
        .map((a) => (a.igUsername || "").trim().toLowerCase())
        .filter(Boolean);
      const unique = [...new Set(list)];
      if (unique.length === 0) {
        log("warn", "CRM returned no accounts with an IG username; using fallback list");
        return CONFIG.FALLBACK_ACCOUNTS;
      }
      log("success", `Fetched ${unique.length} account(s) from the CRM Accounts tab`);
      return unique;
    } catch (e) {
      log("warn", `Account list fetch failed (${e.message}); using fallback list`);
      return CONFIG.FALLBACK_ACCOUNTS;
    }
  }

  // Logs the current outbound IP (through the proxy, if set) so you can confirm
  // in scraper.log that it stays the SAME across hourly runs — a changing IP is
  // the #1 thing that gets a logged-in Instagram account flagged.
  async logEgressIp() {
    try {
      await this.page.goto("https://ipinfo.io/json", { timeout: 20000, waitUntil: "domcontentloaded" });
      const info = await this.page.evaluate(() => {
        try { return JSON.parse(document.body.innerText); } catch { return null; }
      });
      if (info && info.ip) {
        log("info", `Egress IP: ${info.ip} (${info.city || "?"}, ${info.country || "?"})`);
      }
    } catch (e) {
      log("warn", `Could not check egress IP: ${e.message}`);
    }
  }

  async runOnce() {
    const isLoginOnly = process.argv.includes("--login-only");
    try {
      await this.init(!isLoginOnly); // headed for login-only
      await this.logEgressIp();
      const ok = await this.login();
      if (!ok) { log("error", "Login failed!"); return; }
      if (isLoginOnly) { log("success", "Session saved. You can now run headless."); return; }

      const accounts = await this.fetchAccounts();
      const results = [];
      for (const u of accounts) {
        const r = await this.scrapeAccount(u);
        if (r) results.push(r);
        await this.page.waitForTimeout(CONFIG.DELAY_BETWEEN_ACCOUNTS);
      }
      log("info", `Scraped ${results.length}/${accounts.length} accounts`);
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
