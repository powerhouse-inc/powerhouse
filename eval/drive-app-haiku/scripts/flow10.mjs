import { open, BASE, settle } from "./pwlib.mjs";
const { context, page, errors } = await open();
await page.goto(BASE + "/d/stockroom-existing-NqfhsKuJ5H6Uouw_jyHOEtWqxcECjS5dFXatnb-VtF4", { waitUntil: "networkidle", timeout: 90000 });
await page.getByText("Reject all cookies").click().catch(() => {});
await settle(page, 3000);
console.log("BODY", JSON.stringify((await page.locator("body").innerText()).slice(0, 250)));
console.log("ERRORS", JSON.stringify(errors.slice(0, 3)));
await context.close();
