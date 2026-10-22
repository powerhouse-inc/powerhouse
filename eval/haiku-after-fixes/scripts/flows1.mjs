import { chromium } from "/home/user/powerhouse/test/package-e2e/node_modules/@playwright/test/index.mjs";
const BASE = "http://localhost:2867";
const log = (...a) => console.log(...a);
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
const errs = [];
page.on("pageerror", (e) => errs.push("PAGEERROR " + e.message.slice(0, 160)));
page.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 160)); });
async function dismissCookies() {
  const rej = page.getByRole("button", { name: "Reject all cookies" });
  if (await rej.isVisible().catch(() => false)) { await rej.click(); await page.waitForTimeout(600); }
}
await page.goto(BASE + "/inventory", { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(12000); await dismissCookies();
await page.waitForSelector("table tbody tr", { timeout: 60000 });

// Flow A: click a row link
await page.getByRole("link", { name: "Part 10" }).click();
await page.waitForTimeout(5000);
log("A url after row click:", page.url());
await page.screenshot({ path: "/tmp/connect-eval4/shots/04-row-open-editor.png" });
const bodyA = (await page.innerText("body")).replace(/\s+/g, " ").slice(0, 300);
log("A text:", bodyA);

// Back to inventory
await page.goto(BASE + "/inventory", { waitUntil: "domcontentloaded" });
await page.waitForSelector("table tbody tr", { timeout: 60000 });

// Flow B: create via modal link
await page.getByRole("link", { name: "New inventory item" }).click();
await page.waitForTimeout(3000);
log("B url after modal link:", page.url());
await page.screenshot({ path: "/tmp/connect-eval4/shots/05-create-modal.png" });
log("B text:", (await page.innerText("body")).replace(/\s+/g, " ").slice(0, 400));
log("errors so far:", errs.slice(0, 6).join(" | "));
await browser.close();
