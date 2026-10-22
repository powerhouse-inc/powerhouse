// Pagination check: count rows, click Load more, count again
import { chromium } from "/home/user/powerhouse/test/package-e2e/node_modules/@playwright/test/index.mjs";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errs = [];
page.on("pageerror", (e) => errs.push(e.message.slice(0, 200)));
await page.goto("http://localhost:2867/inventory", { waitUntil: "domcontentloaded", timeout: 60000 });
const rej = page.getByRole("button", { name: "Reject all cookies" });
if (await rej.isVisible().catch(() => false)) await rej.click();
await page.waitForSelector("table tbody tr", { timeout: 60000 });
await page.waitForTimeout(1500);
const rows1 = await page.locator("table tbody tr").count();
const more = page.getByRole("button", { name: "Load more" });
const hasMore = await more.isVisible().catch(() => false);
console.log("rows before:", rows1, "loadMore visible:", hasMore);
if (hasMore) { await more.click(); await page.waitForTimeout(4000); }
const rows2 = await page.locator("table tbody tr").count();
console.log("rows after:", rows2, "loadMore still:", await page.getByRole("button", { name: "Load more" }).isVisible().catch(() => false));
await page.screenshot({ path: "/tmp/connect-eval4/shots/03-inventory-paged.png", fullPage: true });
console.log("errors:", errs.slice(0,3));
await browser.close();
