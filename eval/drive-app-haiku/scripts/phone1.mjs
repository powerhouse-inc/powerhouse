import { open, BASE, settle } from "./pwlib.mjs";
const { context, page, errors } = await open({ width: 390, height: 844 }, "light");
await page.goto(BASE + "/d/stockroom-ui-aaY1R2GfWmknHeW2TPeaBfSkL3DkdJYXMd8VsJCu7hY", { waitUntil: "networkidle", timeout: 90000 });
await page.getByText("Reject all cookies").click().catch(() => {});
await settle(page, 2500);
console.log("overflow", JSON.stringify(await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }))));
await page.screenshot({ path: "/tmp/connect-eval-drive-haiku/shots/31-phone-light-drive-v2.png" });
console.log("errors", JSON.stringify(errors.slice(0, 2)));
await context.close();
