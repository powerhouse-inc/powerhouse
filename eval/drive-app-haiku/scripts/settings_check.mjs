import { open, BASE, settle } from "./pwlib.mjs";
const { context, page, errors } = await open();
await page.goto(BASE + "/settings", { waitUntil: "networkidle", timeout: 90000 });
await page.getByText("Reject all cookies").click().catch(() => {});
await settle(page, 1500);
console.log("SETTINGS", JSON.stringify((await page.locator("body").innerText()).slice(0, 400)));
await context.close();
