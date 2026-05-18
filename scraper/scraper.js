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
 *   node scraper.js --login-only # Just login and save session
 * 
 * Cron: 0 * * * * cd /path/to/scraper && node scraper.js --once >> scraper.log 2>&1
 */

const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

// ============================================
// CONFIGURATION
// ============================================

const CONFIG = {
  // Instagram bot account
  IG_USERNAME: process.env.IG_USERNAME || "pheonyx637",
  IG_PASSWORD: process.env.IG_PASSWORD || "mB8eXrFQuo",
  
  // CRM API
  CRM_URL: process.env.CRM_URL || "https://effortless-crm-vn4uw.ondigitalocean.app",
  SCRAPER_SECRET: process.env.SCRAPER_SECRET || "effortless-scraper-2026",
  
  // Accounts to scrape (Instagram usernames)
  ACCOUNTS: [
    "brooxpoppy",
    "poppybroooks",
    "xpoppybrooks",
    "poppybroo",
  ],
  
  // Session storage
  SESSION_FILE: path.join(__dirname, ".ig-session.json"),
  
  // Timing
  DELAY_BETWEEN_ACCOUNTS: 5000,  // 5s between accounts
  DELAY_BETWEEN_REELS: 2000,     // 2s between reel hovers
  SCROLL_DELAY: 1500,
  PAGE_LOAD_WAIT: 4000,
};

// ============================================
// LOGGER
// ============================================

function log(level, message, data = null) {
  const timestamp = new Date().toISOString();
  const prefix = { info: "ℹ️", success: "✅", warn: "⚠️", error: "❌", scrape: "🔍" }[level] || "📋";
  console.log(`[${timestamp}] ${prefix} ${message}`);
  if (data) console.log(JSON.stringify(data, null, 2));
}

// ============================================
// SCRAPER
// ============================================

class InstagramScraper {
  constructor() {
    this.browser = null;
    this.context = null;
    this.page = null;
  }

  async init() {
    log("info", "Launching browser...");
    this.browser = await chromium.launch({
      headless: true, // Set to false for debugging
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    // Try to load saved session
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
    
    // Block unnecessary resources for speed
    await this.page.route("**/*.{png,jpg,jpeg,gif,svg,mp4,webm,woff,woff2}", (route) => {
      route.abort();
    });
  }

  async login() {
    log("info", "Checking login status...");
    
    await this.page.goto("https://www.instagram.com/", { waitUntil: "networkidle", timeout: 30000 });
    await this.page.waitForTimeout(3000);

    // Check if already logged in
    const currentUrl = this.page.url();
    if (!currentUrl.includes("/accounts/login")) {
      // Check for login indicators
      const isLoggedIn = await this.page.evaluate(() => {
        return document.querySelector('svg[aria-label="Home"]') !== null ||
               document.querySelector('a[href="/direct/inbox/"]') !== null ||
               document.querySelector('[aria-label="New post"]') !== null;
      });
      
      if (isLoggedIn) {
        log("success", "Already logged in with saved session!");
        await this.saveSession();
        return true;
      }
    }

    log("info", "Need to login...");
    await this.page.goto("https://www.instagram.com/accounts/login/", { waitUntil: "networkidle", timeout: 30000 });
    await this.page.waitForTimeout(3000);

    // Handle cookie consent
    try {
      const cookieBtn = await this.page.$("button:has-text('Allow all cookies'), button:has-text('Accept')");
      if (cookieBtn) {
        await cookieBtn.click();
        await this.page.waitForTimeout(1000);
      }
    } catch (e) { /* no cookie banner */ }

    // Fill login form
    const usernameInput = await this.page.$('input[name="username"]');
    const passwordInput = await this.page.$('input[name="password"]');
    
    if (!usernameInput || !passwordInput) {
      log("error", "Login form not found!");
      return false;
    }

    await usernameInput.fill(CONFIG.IG_USERNAME);
    await this.page.waitForTimeout(500);
    await passwordInput.fill(CONFIG.IG_PASSWORD);
    await this.page.waitForTimeout(500);

    // Click login
    await this.page.click('button[type="submit"]');
    await this.page.waitForTimeout(8000);

    // Check for 2FA
    const is2FA = await this.page.evaluate(() => {
      return document.body.innerText.includes("security code") ||
             document.body.innerText.includes("verification") ||
             document.body.innerText.includes("confirm");
    });

    if (is2FA) {
      log("warn", "2FA required! Please check your phone and run with --login-only to complete.");
      // Wait for manual 2FA input (if running interactively)
      if (process.argv.includes("--login-only")) {
        log("info", "Waiting 60 seconds for 2FA code to be entered manually...");
        await this.page.waitForTimeout(60000);
      }
    }

    // Handle "Save Login Info" dialog
    try {
      const saveInfoBtn = await this.page.$("button:has-text('Save info'), button:has-text('Save Info')");
      if (saveInfoBtn) {
        await saveInfoBtn.click();
        await this.page.waitForTimeout(2000);
      }
    } catch (e) { /* no save info dialog */ }

    // Handle "Turn on Notifications" dialog
    try {
      const notNowBtn = await this.page.$("button:has-text('Not Now')");
      if (notNowBtn) {
        await notNowBtn.click();
        await this.page.waitForTimeout(1000);
      }
    } catch (e) { /* no notification dialog */ }

    // Verify login
    await this.page.waitForTimeout(3000);
    const loginSuccess = await this.page.evaluate(() => {
      return document.querySelector('svg[aria-label="Home"]') !== null ||
             document.querySelector('a[href="/direct/inbox/"]') !== null;
    });

    if (loginSuccess) {
      log("success", "Login successful!");
      await this.saveSession();
      return true;
    } else {
      log("error", "Login failed - could not verify logged-in state");
      return false;
    }
  }

  async saveSession() {
    const storageState = await this.context.storageState();
    fs.writeFileSync(CONFIG.SESSION_FILE, JSON.stringify(storageState, null, 2));
    log("info", "Session saved to disk");
  }

  async scrapeAccount(igUsername) {
    log("scrape", `Scraping @${igUsername}...`);
    
    const result = {
      igUsername,
      followers: 0,
      following: 0,
      postsCount: 0,
      reels: [],
    };

    try {
      // 1. Visit profile page to get follower count
      await this.page.goto(`https://www.instagram.com/${igUsername}/`, {
        waitUntil: "networkidle",
        timeout: 30000,
      });
      await this.page.waitForTimeout(CONFIG.PAGE_LOAD_WAIT);

      // Check if account exists
      const pageNotFound = await this.page.evaluate(() => {
        return document.body.innerText.includes("Sorry, this page isn't available") ||
               document.body.innerText.includes("Page Not Found");
      });

      if (pageNotFound) {
        log("warn", `Account @${igUsername} not found!`);
        return null;
      }

      // Extract profile stats
      const profileStats = await this.page.evaluate(() => {
        const stats = { followers: 0, following: 0, posts: 0 };
        
        // Try to get stats from meta tag first
        const metaDesc = document.querySelector('meta[name="description"]');
        if (metaDesc) {
          const content = metaDesc.getAttribute("content") || "";
          const followersMatch = content.match(/([\d,.]+[KMkm]?)\s*Followers/i);
          const followingMatch = content.match(/([\d,.]+[KMkm]?)\s*Following/i);
          const postsMatch = content.match(/([\d,.]+[KMkm]?)\s*Posts/i);
          
          if (followersMatch) stats.followers = parseCount(followersMatch[1]);
          if (followingMatch) stats.following = parseCount(followingMatch[1]);
          if (postsMatch) stats.posts = parseCount(postsMatch[1]);
        }

        // Fallback: try to get from header section
        if (stats.followers === 0) {
          const headerSection = document.querySelector("header section");
          if (headerSection) {
            const listItems = headerSection.querySelectorAll("li");
            listItems.forEach((li) => {
              const text = li.innerText;
              const numMatch = text.match(/([\d,.]+[KMkm]?)/);
              if (numMatch) {
                const num = parseCount(numMatch[1]);
                if (text.toLowerCase().includes("follower")) stats.followers = num;
                else if (text.toLowerCase().includes("following")) stats.following = num;
                else if (text.toLowerCase().includes("post")) stats.posts = num;
              }
            });
          }
        }

        // Another fallback: look for spans with title attributes (exact counts)
        if (stats.followers === 0) {
          const spans = document.querySelectorAll("span[title]");
          spans.forEach((span) => {
            const title = span.getAttribute("title");
            const parent = span.closest("li");
            if (parent && title) {
              const num = parseInt(title.replace(/,/g, ""));
              const parentText = parent.innerText.toLowerCase();
              if (parentText.includes("follower")) stats.followers = num;
              else if (parentText.includes("following")) stats.following = num;
            }
          });
        }

        function parseCount(str) {
          if (!str) return 0;
          str = str.replace(/,/g, "");
          if (str.match(/[Kk]$/)) return Math.round(parseFloat(str) * 1000);
          if (str.match(/[Mm]$/)) return Math.round(parseFloat(str) * 1000000);
          return parseInt(str) || 0;
        }

        return stats;
      });

      result.followers = profileStats.followers;
      result.following = profileStats.following;
      result.postsCount = profileStats.posts;

      log("info", `@${igUsername}: ${result.followers} followers, ${result.postsCount} posts`);

      // 2. Navigate to reels tab
      await this.page.goto(`https://www.instagram.com/${igUsername}/reels/`, {
        waitUntil: "networkidle",
        timeout: 30000,
      });
      await this.page.waitForTimeout(CONFIG.PAGE_LOAD_WAIT);

      // 3. Scroll to load more reels
      let previousReelCount = 0;
      let scrollAttempts = 0;
      const maxScrolls = 5; // Load up to ~60 reels

      while (scrollAttempts < maxScrolls) {
        await this.page.evaluate(() => {
          window.scrollTo(0, document.body.scrollHeight);
        });
        await this.page.waitForTimeout(CONFIG.SCROLL_DELAY);
        
        const currentCount = await this.page.evaluate(() => {
          return document.querySelectorAll('a[href*="/reel/"]').length;
        });
        
        if (currentCount === previousReelCount) break;
        previousReelCount = currentCount;
        scrollAttempts++;
      }

      // 4. Extract reel data from the grid
      const reelElements = await this.page.evaluate(() => {
        const reels = [];
        const links = document.querySelectorAll('a[href*="/reel/"]');
        
        links.forEach((link) => {
          const href = link.getAttribute("href") || "";
          const shortcodeMatch = href.match(/\/reel\/([^/]+)/);
          if (!shortcodeMatch) return;
          
          const shortcode = shortcodeMatch[1];
          
          // Get view count or like count from the overlay
          let views = 0;
          let likes = 0;
          
          // Look for the overlay with play icon (views) or heart icon (likes)
          const spans = link.querySelectorAll("span");
          spans.forEach((span) => {
            const text = span.innerText.trim();
            if (!text) return;
            
            // Check the icon next to it
            const svgParent = span.closest("li") || span.parentElement;
            const svg = svgParent?.querySelector("svg");
            const ariaLabel = svg?.getAttribute("aria-label") || "";
            
            const num = parseReelCount(text);
            
            if (ariaLabel.toLowerCase().includes("like") || ariaLabel.toLowerCase().includes("heart")) {
              likes = num;
            } else {
              // Default to views (play icon or no specific icon)
              views = num;
            }
          });

          // Get thumbnail
          const img = link.querySelector("img");
          const thumbnailUrl = img?.getAttribute("src") || null;

          reels.push({ shortcode, views, likes, thumbnailUrl });
        });

        function parseReelCount(str) {
          if (!str) return 0;
          str = str.replace(/,/g, "").trim();
          if (str.match(/[Kk]$/)) return Math.round(parseFloat(str) * 1000);
          if (str.match(/[Mm]$/)) return Math.round(parseFloat(str) * 1000000);
          return parseInt(str) || 0;
        }

        return reels;
      });

      result.reels = reelElements;
      log("success", `@${igUsername}: Found ${result.reels.length} reels`);

      // Log top 3 reels
      const topReels = [...result.reels].sort((a, b) => b.views - a.views).slice(0, 3);
      topReels.forEach((r) => {
        log("info", `  ├─ ${r.shortcode}: ${r.views} views, ${r.likes} likes`);
      });

    } catch (error) {
      log("error", `Failed to scrape @${igUsername}: ${error.message}`);
    }

    return result;
  }

  async syncToCRM(accountsData) {
    log("info", `Syncing ${accountsData.length} accounts to CRM...`);

    try {
      const response = await fetch(`${CONFIG.CRM_URL}/api/scraper/sync`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${CONFIG.SCRAPER_SECRET}`,
        },
        body: JSON.stringify({ accounts: accountsData }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        log("error", `CRM sync failed (${response.status}): ${errorText}`);
        return false;
      }

      const result = await response.json();
      log("success", "CRM sync complete!", result);
      return true;
    } catch (error) {
      log("error", `CRM sync error: ${error.message}`);
      return false;
    }
  }

  async runOnce() {
    try {
      await this.init();
      
      const loggedIn = await this.login();
      if (!loggedIn) {
        log("error", "Cannot proceed without login!");
        return;
      }

      const allResults = [];

      for (const username of CONFIG.ACCOUNTS) {
        const result = await this.scrapeAccount(username);
        if (result) {
          allResults.push(result);
        }
        
        // Delay between accounts to avoid rate limiting
        await this.page.waitForTimeout(CONFIG.DELAY_BETWEEN_ACCOUNTS);
      }

      log("info", `Scraped ${allResults.length}/${CONFIG.ACCOUNTS.length} accounts`);

      // Sync to CRM
      if (allResults.length > 0) {
        await this.syncToCRM(allResults);
      }

      // Save session after successful run
      await this.saveSession();

    } catch (error) {
      log("error", `Scraper error: ${error.message}`);
    } finally {
      if (this.browser) {
        await this.browser.close();
      }
    }
  }

  async runScheduled(intervalMs = 60 * 60 * 1000) {
    log("info", `Starting scheduled scraper (every ${intervalMs / 60000} minutes)`);
    
    // Run immediately
    await this.runOnce();

    // Then schedule
    setInterval(async () => {
      log("info", "=== Scheduled scrape starting ===");
      
      // Re-initialize browser for each run
      this.browser = null;
      this.context = null;
      this.page = null;
      
      await this.runOnce();
    }, intervalMs);
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
    }
  }
}

// ============================================
// MAIN
// ============================================

async function main() {
  const args = process.argv.slice(2);
  const scraper = new InstagramScraper();

  if (args.includes("--login-only")) {
    log("info", "Login-only mode");
    await scraper.init();
    const success = await scraper.login();
    if (success) {
      log("success", "Login successful! Session saved.");
    }
    await scraper.close();
    return;
  }

  if (args.includes("--once")) {
    log("info", "Single run mode");
    await scraper.runOnce();
    return;
  }

  // Default: scheduled mode (every hour)
  const interval = parseInt(process.env.SCRAPE_INTERVAL || "3600000"); // 1 hour
  await scraper.runScheduled(interval);
}

main().catch((error) => {
  log("error", `Fatal error: ${error.message}`);
  process.exit(1);
});
