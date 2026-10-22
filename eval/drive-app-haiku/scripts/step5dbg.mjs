import { open, BASE, settle } from "./pwlib.mjs";
const { context, page, errors } = await open();
await page.goto(BASE + "/inventory", { waitUntil: "networkidle", timeout: 90000 });
await settle(page, 2000);
console.log("URL", page.url());
console.log("BODY", JSON.stringify((await page.locator("body").innerText()).slice(0, 300)));
await page.screenshot({ path: "/tmp/connect-eval-drive-haiku/shots/21-dbg.png" });
console.log("ERRORS", JSON.stringify(errors.slice(0, 4)));
await context.close();
