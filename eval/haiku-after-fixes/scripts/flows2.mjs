import { chromium } from "/home/user/powerhouse/test/package-e2e/node_modules/@playwright/test/index.mjs";
const BASE = "http://localhost:2867";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
async function session(scheme, w = 1280, h = 900) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: scheme });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message.slice(0, 150)));
  return { page, errs };
}
async function open(page, path) {
  await page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(12000);
  const rej = page.getByRole("button", { name: "Reject all cookies" });
  if (await rej.isVisible().catch(() => false)) { await rej.click(); await page.waitForTimeout(800); }
}
const txt = async (p) => (await p.innerText("body")).replace(/\s+/g, " ").slice(0, 220);
const { page, errs } = await session("light");
// Home
await open(page, "/");
console.log("HOME:", await txt(page));
await page.screenshot({ path: "/tmp/connect-eval4/shots/11-home-light.png" });
await page.getByText("Items, quantities and locations").first().click().catch((e) => console.log("home card click fail", e.message.split("\n")[0]));
await page.waitForTimeout(4000);
console.log("after home card click:", page.url());
// Settings tab
await open(page, "/settings/inventory");
console.log("SETTINGS:", page.url(), "|", await txt(page));
await page.screenshot({ path: "/tmp/connect-eval4/shots/12-settings-inventory.png" });
// Print route (full page, no sidebar)
await open(page, "/inventory-print");
console.log("PRINT:", page.url(), "|", await txt(page));
await page.screenshot({ path: "/tmp/connect-eval4/shots/13-print-route.png" });
// Inventory dark
const d = await session("dark");
await open(d.page, "/inventory");
await d.page.screenshot({ path: "/tmp/connect-eval4/shots/14-inventory-dark.png" });
console.log("dark html class:", await d.page.evaluate(() => document.documentElement.className));
await open(d.page, "/d/vetra-cea183c0/spacer-ring-oXGJ-38HESjRsIBHu-AkBIT8VnYXy-XIkyIe7b7vfdY");
await d.page.screenshot({ path: "/tmp/connect-eval4/shots/15-editor-dark.png" });
console.log("errors light:", errs.join(" | ") || "none", "| dark:", d.errs.join(" | ") || "none");
await browser.close();
