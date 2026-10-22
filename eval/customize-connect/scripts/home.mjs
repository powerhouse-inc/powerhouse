import { open, shot, BASE } from "./lib.mjs";
const { browser, page, logs } = await open();
page.on("framenavigated", (f) => { if (f === page.mainFrame()) console.log("navigated", f.url()); });
await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
await page.getByTestId("inventory-card").waitFor({ timeout: 90000 });
const count = async (l) => `card=${await page.getByTestId("inventory-card").count()} driveLinks=${await page.locator('a[href^="/d/"]').count()}`;
console.log("before:", await count());
await page.evaluate(() => { window.__marker = 1; });
await page.getByRole("button", { name: "Reject all cookies" }).click();
for (const ms of [100, 500, 1500, 4000, 8000]) {
  await page.waitForTimeout(ms);
  console.log(`after +${ms}ms:`, await count(), "marker:", await page.evaluate(() => window.__marker));
}
await shot(page, "06-home-after-reject");
console.log("LOGS:\n" + logs.join("\n"));
await browser.close();
