import { open, shot, BASE } from "./lib.mjs";
const { browser, page, logs } = await open();
await page.goto(BASE + "/inventory", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(9000);
await shot(page, "21-shell-error");
console.log((await page.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 500));
const ov = await page.locator("vite-error-overlay").count();
console.log("vite overlay:", ov, ov ? (await page.locator("vite-error-overlay").evaluate((e) => e.shadowRoot?.textContent?.replace(/\s+/g, " ").slice(0, 400))) : "");
await browser.close();
