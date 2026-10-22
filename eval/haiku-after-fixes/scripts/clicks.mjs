import { chromium } from "/home/user/powerhouse/test/package-e2e/node_modules/@playwright/test/index.mjs";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
const errs = []; page.on("pageerror", (e) => errs.push(e.message.slice(0, 120)));
async function open(path) {
  await page.goto("http://localhost:2867" + path, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(12000);
  const rej = page.getByRole("button", { name: "Reject all cookies" });
  if (await rej.isVisible().catch(() => false)) { await rej.click(); await page.waitForTimeout(800); }
}
await open("/settings/appearance");
await page.getByRole("link", { name: "Inventory" }).first().click().catch((e) => console.log("settings tab link fail:", e.message.split("\n")[0]));
await page.waitForTimeout(4000);
console.log("1 settings tab click ->", page.url());
await open("/");
await page.locator('a[title="Inventory"], [title="Inventory"]').first().click().catch((e) => console.log("sidebar I fail:", e.message.split("\n")[0]));
await page.waitForTimeout(4000);
console.log("2 sidebar Inventory click ->", page.url());
await open("/inventory-print");
await page.getByRole("link", { name: "Back to Connect" }).click().catch((e) => console.log("back fail", e.message.split("\n")[0]));
await page.waitForTimeout(4000);
console.log("3 print back link ->", page.url());
await open("/d/vetra-cea183c0/spacer-ring-oXGJ-38HESjRsIBHu-AkBIT8VnYXy-XIkyIe7b7vfdY");
await page.getByRole("spinbutton").first().fill("-100");
await page.getByRole("button", { name: "Adjust", exact: true }).click();
await page.waitForTimeout(3000);
const alertBefore = await page.getByRole("alert").count();
await page.getByRole("button", { name: "Dismiss" }).click().catch((e) => console.log("dismiss fail", e.message.split("\n")[0]));
await page.waitForTimeout(500);
console.log("4 banner shown:", alertBefore, "after dismiss:", await page.getByRole("alert").count());
console.log("errors:", errs.slice(0, 3).join(" | ") || "none");
await browser.close();
