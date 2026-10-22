import { chromium } from "/home/user/powerhouse/test/package-e2e/node_modules/@playwright/test/index.mjs";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
async function open(path) {
  await page.goto("http://localhost:2867" + path, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(12000);
  const rej = page.getByRole("button", { name: "Reject all cookies" });
  if (await rej.isVisible().catch(() => false)) { await rej.click(); await page.waitForTimeout(800); }
}
await open("/settings/appearance");
const tabs = await page.$$eval("a", (as) => as.filter((a) => a.textContent.trim() === "Inventory").map((a) => a.getAttribute("href")));
console.log("settings tab hrefs:", JSON.stringify(tabs));
if (tabs.length) { await page.locator(`a[href="${tabs[tabs.length - 1]}"]`).click(); await page.waitForTimeout(4000); console.log("settings tab click ->", page.url()); }
await open("/");
const sbHrefs = await page.$$eval("nav a, nav button", (els) => els.map((e) => [e.textContent.trim(), e.getAttribute("href"), e.getAttribute("title"), e.getAttribute("aria-label")]).slice(0, 12));
console.log("sidebar:", JSON.stringify(sbHrefs));
await page.locator("nav").getByText("I", { exact: true }).first().click().catch((e) => console.log("I fail", e.message.split("\n")[0]));
await page.waitForTimeout(4000);
console.log("sidebar I ->", page.url());
await browser.close();
