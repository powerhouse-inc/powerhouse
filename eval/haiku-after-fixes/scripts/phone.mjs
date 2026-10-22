import { chromium } from "/home/user/powerhouse/test/package-e2e/node_modules/@playwright/test/index.mjs";
const BASE = "http://localhost:2867";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
const page = await ctx.newPage();
async function open(path) {
  await page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(12000);
  const rej = page.getByRole("button", { name: "Reject all cookies" });
  if (await rej.isVisible().catch(() => false)) { await rej.click(); await page.waitForTimeout(800); }
}
for (const [path, name] of [["/inventory", "16-phone-inventory"], ["/", "17-phone-home"], ["/d/vetra-cea183c0/spacer-ring-oXGJ-38HESjRsIBHu-AkBIT8VnYXy-XIkyIe7b7vfdY", "18-phone-editor"]]) {
  await open(path);
  const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  console.log(name, "scrollWidth", m.sw, "clientWidth", m.cw, m.sw > m.cw ? "HORIZONTAL SCROLL" : "ok");
  await page.screenshot({ path: `/tmp/connect-eval4/shots/${name}.png` });
}
await browser.close();
