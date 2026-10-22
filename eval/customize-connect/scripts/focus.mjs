import { open, BASE } from "./lib.mjs";
const { browser, page, logs } = await open();
await page.goto(BASE + "/focus", { waitUntil: "domcontentloaded" });
const ok = await page.getByTestId("focus-page").waitFor({ timeout: 60000 }).then(() => true).catch(() => false);
await page.waitForTimeout(1500);
console.log("focus page:", ok, "sidebar drive links:", await page.locator('a[href^="/d/"]').count(), "nav links:", await page.locator('a[href="/inventory"]').count());
console.log(logs.join("\n"));
await browser.close();
