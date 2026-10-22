import { chromium } from "/home/user/powerhouse/test/package-e2e/node_modules/@playwright/test/index.mjs";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
await page.goto("http://localhost:2867/inventory", { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(12000);
const rej = page.getByRole("button", { name: "Reject all cookies" });
if (await rej.isVisible().catch(() => false)) { await rej.click(); await page.waitForTimeout(600); }
await page.goto("http://localhost:2867/d/vetra-cea183c0/clamp-jaw-KGEM7oNkNrcDxyD-6xQFRgh6LVDWH64-WiZsEH-9_jY", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(8000);
const dbg = async (t) => console.log(t, (await page.locator("[data-testid=dbg]").textContent().catch(() => "none")).slice(0, 400));
await dbg("before:");
await page.getByRole("spinbutton").first().fill("-100");
await page.getByRole("button", { name: "Adjust", exact: true }).click();
await page.waitForTimeout(1500); await dbg("after 1.5s:");
await page.waitForTimeout(5000); await dbg("after 6.5s:");
console.log("alert:", await page.getByRole("alert").count());
await browser.close();
