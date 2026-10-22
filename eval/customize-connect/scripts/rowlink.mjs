import { open, shot, BASE } from "./lib.mjs";
const { browser, page, logs } = await open();
await page.goto(BASE + "/inventory", { waitUntil: "domcontentloaded" });
await page.getByTestId("inventory-row").first().waitFor({ timeout: 90000 });
const reject = page.getByRole("button", { name: "Reject all cookies" });
await reject.waitFor({ timeout: 15000 }).then(() => reject.click()).catch(() => {});
await page.waitForTimeout(1500);
await page.evaluate(() => { window.__marker = 1; });
const a = page.getByRole("link", { name: "Washers" });
console.log("href:", await a.getAttribute("href"));
await a.click();
await page.waitForTimeout(3000);
console.log("url:", page.url(), "no reload:", await page.evaluate(() => window.__marker === 1));
console.log("qty:", await page.getByTestId("quantity").innerText().catch(() => "n/a"));
// dispatch through the editor UI
await page.getByLabel("Amount").fill("5");
await page.getByRole("button", { name: "Remove" }).click();
await page.waitForTimeout(1500);
console.log("qty after remove 5:", await page.getByTestId("quantity").innerText());
await shot(page, "15-editor");
// browser back to inventory and check summary reflects the change
await page.goBack();
await page.getByTestId("inventory-summary").waitFor();
await page.waitForTimeout(1000);
console.log("back:", page.url(), await page.getByTestId("inventory-summary").innerText());
console.log("LOGS:\n" + logs.join("\n"));
await browser.close();
