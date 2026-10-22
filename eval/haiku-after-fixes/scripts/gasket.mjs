import { chromium } from "/home/user/powerhouse/test/package-e2e/node_modules/@playwright/test/index.mjs";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
await page.goto("http://localhost:2867/inventory", { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(12000);
const rej = page.getByRole("button", { name: "Reject all cookies" });
if (await rej.isVisible().catch(() => false)) { await rej.click(); await page.waitForTimeout(600); }
await page.waitForSelector("table tbody tr", { timeout: 60000 });
const hrefs = await page.$$eval("table tbody tr", (trs) => trs.map((t) => [t.innerText.split("\t")[0], t.querySelector("a")?.getAttribute("href")]).filter(([n]) => n.startsWith("Gasket")));
console.log(JSON.stringify(hrefs));
for (const [n, h] of hrefs) {
  await page.goto("http://localhost:2867" + h, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(8000);
  console.log(n, "->", (await page.innerText("body")).replace(/\s+/g, " ").slice(0, 160));
}
await browser.close();
