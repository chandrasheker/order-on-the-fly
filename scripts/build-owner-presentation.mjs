/**
 * Capture TableTap screenshots and build owner presentation PPT.
 * Run: node scripts/build-owner-presentation.mjs
 */
import { chromium } from "playwright";
import { mkdirSync } from "fs";
import { execSync } from "child_process";
import path from "path";
import crypto from "node:crypto";

const BASE = "http://localhost:3000";
const OUT = path.join(process.cwd(), "presentation", "screenshots");
const SLUG = "varanasi";
const TABLE_TOKEN = "varanasi-table-1";

mkdirSync(OUT, { recursive: true });

async function shot(page, name, url, opts = {}) {
  const file = path.join(OUT, `${name}.png`);
  console.log(`  → ${name}`);
  if (url) await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
  if (opts.waitMs) await page.waitForTimeout(opts.waitMs);
  if (opts.selector) {
    const el = page.locator(opts.selector);
    await el.waitFor({ state: "visible", timeout: 30000 });
    await el.screenshot({ path: file });
  } else {
    await page.screenshot({ path: file, fullPage: opts.fullPage ?? false });
  }
  return file;
}

async function staffLogin(page) {
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', "owner@varanasi.com");
  await page.fill('input[type="password"]', "admin123");
  await page.click('button[type="submit"]');
  await page.waitForURL("**/staff/dashboard**", { timeout: 30000 });
  await page.waitForTimeout(1500);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 430, height: 932 },
    deviceScaleFactor: 2,
  });
  const mobile = await ctx.newPage();

  // Seed session + dining cookie via check-in API
  const sessionKey = crypto.randomUUID();
  await ctx.request.post(`${BASE}/api/tables/check-in`, {
    data: { tableToken: TABLE_TOKEN, sessionKey },
  });
  await mobile.addInitScript(
    ({ token, key }) => {
      sessionStorage.setItem(`tabletap-session-${token}`, key);
    },
    { token: TABLE_TOKEN, key: sessionKey },
  );

  const desktopCtx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  const desktop = await desktopCtx.newPage();

  console.log("Capturing screenshots…");

  execSync(`sqlite3 dev.db 'UPDATE "Table" SET orderingEnabled = 1;'`, {
    stdio: "inherit",
    cwd: process.cwd(),
  });

  // Customer mobile flow — check-in then menu
  await mobile.goto(`${BASE}/order/${SLUG}/${TABLE_TOKEN}/check-in`, {
    waitUntil: "networkidle",
    timeout: 60000,
  });
  await mobile.waitForTimeout(1200);
  await shot(mobile, "01-customer-checkin", null, { waitMs: 300 });

  await mobile.goto(`${BASE}/order/${SLUG}/${TABLE_TOKEN}`, { waitUntil: "networkidle" });
  await mobile.waitForSelector("text=Varanasi Restaurant", { timeout: 30000 });
  await mobile.waitForTimeout(1500);
  await shot(mobile, "02-customer-menu", null, { waitMs: 500 });

  // Expand first category if collapsed
  const categoryBtn = mobile.locator("button").filter({ hasText: /Beverages|Tea|Starters/i }).first();
  if (await categoryBtn.count()) {
    await categoryBtn.click().catch(() => {});
    await mobile.waitForTimeout(600);
  }
  await mobile.evaluate(() => window.scrollTo(0, 320));
  await shot(mobile, "03-customer-menu-scroll", null, { waitMs: 800 });

  // Staff desktop
  await staffLogin(desktop);
  await shot(desktop, "04-staff-dashboard", null, { waitMs: 1500 });
  await shot(desktop, "05-table-ordering-panel", null, {
    selector: "main",
    waitMs: 500,
  });

  // Pending payments tab if visible
  const pendingTab = desktop.locator("button", { hasText: "Pending Payments" });
  if (await pendingTab.count()) {
    await pendingTab.first().click();
    await desktop.waitForTimeout(1000);
    await shot(desktop, "06-pending-payments", null, { waitMs: 500 });
  }

  await desktop.goto(`${BASE}/admin/qr`, { waitUntil: "networkidle" });
  await desktop.waitForTimeout(1500);
  await shot(desktop, "07-admin-qr-codes", null, { waitMs: 500 });

  await desktop.goto(`${BASE}/admin/menu`, { waitUntil: "networkidle" });
  await desktop.waitForTimeout(1500);
  await shot(desktop, "08-admin-menu", null, { waitMs: 500 });

  await desktop.goto(`${BASE}/admin/reports`, { waitUntil: "networkidle" });
  await desktop.waitForTimeout(1500);
  await shot(desktop, "09-admin-reports", null, { waitMs: 500 });

  // Staff login page (mobile)
  const loginCtx = await browser.newContext({
    viewport: { width: 430, height: 932 },
    deviceScaleFactor: 2,
  });
  const loginPage = await loginCtx.newPage();
  await shot(loginPage, "10-staff-login", `${BASE}/`, { waitMs: 1000 });

  await browser.close();

  console.log("Building PowerPoint…");
  execSync(`python3 scripts/build-visual-pptx.py`, { stdio: "inherit", cwd: process.cwd() });
  console.log("Done: presentation/TableTap-Restaurant-Owner-Visual-Deck.pptx");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
