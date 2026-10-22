import { open, BASE, settle } from "./pwlib.mjs";
const { context, page, errors } = await open();
await page.goto(BASE + "/", { waitUntil: "networkidle", timeout: 90000 });
await page.getByText("Reject all cookies").click().catch(() => {});
await settle(page, 1200);
const card = page.getByText("Stockroom Config", { exact: true }).first();
console.log("card count", await card.count());
if (await card.count()) { await card.click(); await settle(page, 2500); }
console.log("URL", page.url());
console.log("BODY", JSON.stringify((await page.locator("body").innerText()).slice(0, 250)));
await page.screenshot({ path: "/tmp/connect-eval-drive-haiku/shots/23-config-drive.png" });
console.log("ERRORS", JSON.stringify(errors.slice(0, 3)));
await context.close();
