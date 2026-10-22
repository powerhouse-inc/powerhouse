import { chromium } from "/home/user/powerhouse/test/package-e2e/node_modules/@playwright/test/index.mjs";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
await page.goto("http://localhost:2867/inventory", { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(12000);
const rej = page.getByRole("button", { name: "Reject all cookies" });
if (await rej.isVisible().catch(() => false)) { await rej.click(); await page.waitForTimeout(800); }
await page.waitForSelector("table", { timeout: 60000 }).catch(() => console.log("no table"));
const info = await page.evaluate(() => {
  const h1 = [...document.querySelectorAll("h1")].map((e) => { const r = e.getBoundingClientRect(); return [e.textContent, Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]; });
  const tbl = document.querySelector("table"); const t = tbl ? tbl.getBoundingClientRect() : null;
  const main = document.querySelector("main"); const mr = main ? main.getBoundingClientRect() : null;
  const root = document.querySelector("#root, body > div"); 
  return { h1, table: t && [Math.round(t.x), Math.round(t.y), Math.round(t.width), Math.round(t.height)], main: mr && [Math.round(mr.x), Math.round(mr.y), Math.round(mr.width), Math.round(mr.height)], bodyH: document.body.scrollHeight, vh: innerHeight, sidebarTag: [...document.querySelectorAll("nav, aside")].map((e) => e.tagName + ":" + Math.round(e.getBoundingClientRect().y) + "/" + Math.round(e.getBoundingClientRect().height)).join(" ") };
});
console.log(JSON.stringify(info));
await page.screenshot({ path: "/tmp/connect-eval4/shots/19-phone-inventory-full.png", fullPage: true });
await browser.close();
