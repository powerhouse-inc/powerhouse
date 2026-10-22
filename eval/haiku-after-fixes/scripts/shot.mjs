// usage: node shot.mjs <url> <out.png> [width height dark|light] [waitMs]
import { chromium } from "/home/user/powerhouse/test/package-e2e/node_modules/@playwright/test/index.mjs";
const [url, out, w = "1280", h = "900", scheme = "light", wait = "4000"] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: Number(w), height: Number(h) }, colorScheme: scheme, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errs = [];
page.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 200)); });
page.on("pageerror", (e) => errs.push("PAGEERROR " + e.message.slice(0, 200)));
await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 }).catch((e) => errs.push("GOTO " + e.message.slice(0, 150)));
await page.waitForTimeout(Number(wait));
const rej = page.getByRole("button", { name: "Reject all cookies" });
if (await rej.isVisible().catch(() => false)) { await rej.click(); await page.waitForTimeout(800); }
await page.screenshot({ path: out, fullPage: false });
const text = (await page.innerText("body").catch(() => "")).replace(/\s+/g, " ").slice(0, 400);
console.log("URL:", page.url());
console.log("TEXT:", text);
console.log("ERRORS:", errs.length, errs.slice(0, 5).join(" | "));
await browser.close();
