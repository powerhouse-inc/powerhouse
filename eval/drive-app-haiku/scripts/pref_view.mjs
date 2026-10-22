import { open, BASE, settle } from "./pwlib.mjs";
const { context, page, errors } = await open();
await page.goto(BASE + "/d/JHOXJOdvW1k1VQCK_nisJxgmpi0HK6P7GK8O6-idyjo", { waitUntil: "networkidle", timeout: 90000 });
await page.getByText("Reject all cookies").click().catch(() => {});
await settle(page, 3000);
console.log("BODY", JSON.stringify((await page.locator("body").innerText()).slice(0, 500)));
await page.screenshot({ path: "/tmp/connect-eval-drive-haiku/shots/24-pref-drive-mcp-data.png" });
console.log("ERRORS", JSON.stringify(errors.slice(0, 3)));
await context.close();
