import { open, BASE, settle } from "./pwlib.mjs";
const { context, page, errors } = await open();
await page.goto(BASE + "/d/stockroom-ui-aaY1R2GfWmknHeW2TPeaBfSkL3DkdJYXMd8VsJCu7hY", { waitUntil: "networkidle", timeout: 90000 });
await page.getByText("Reject all cookies").click().catch(() => {});
await settle(page, 1500);
console.log("DRIVE BODY", JSON.stringify((await page.locator("body").innerText()).slice(0, 400)));
await page.screenshot({ path: "/tmp/connect-eval-drive-haiku/shots/10-drive-with-item.png" });
await context.close();
console.log("ERRORS", JSON.stringify(errors.slice(0, 5)));
