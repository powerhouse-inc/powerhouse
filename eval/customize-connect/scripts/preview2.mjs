import { open, shot } from "./lib.mjs";
const BASE = "http://localhost:4173";
const { browser, page, logs } = await open();
await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
await page.getByTestId("inventory-card").waitFor({ timeout: 60000 });
const rj = page.getByRole("button", { name: "Reject all cookies" }); await rj.waitFor({ timeout: 15000 }).then(() => rj.click()).catch(() => {});
for (let i = 0; i < 20; i++) { if (await page.locator('a[href^="/d/"]').count()) break; await page.waitForTimeout(1000); }
console.log("drive links:", await page.locator('a[href^="/d/"]').evaluateAll((a) => a.map((x) => x.getAttribute("href"))));
await page.locator('a[href="/inventory"]').first().click();
await page.getByTestId("inventory-page").waitFor({ timeout: 60000 });
let s = ""; for (let i = 0; i < 20; i++) { s = await page.getByTestId("inventory-summary").innerText(); if (!s.startsWith("0 ")) break; await page.waitForTimeout(1000); }
console.log("inventory:", s);
await page.goto(BASE + "/settings/inventory", { waitUntil: "domcontentloaded" });
console.log("settings tab:", await page.getByTestId("inventory-settings").waitFor({ timeout: 30000 }).then(() => true).catch(() => false));
await shot(page, "23-preview-settings");
console.log("LOGS:\n" + logs.slice(0, 15).join("\n"));
await browser.close();
