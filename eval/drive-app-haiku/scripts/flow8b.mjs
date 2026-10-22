import { open, BASE, settle } from "./pwlib.mjs";
const { context, page, errors } = await open();
await page.goto(BASE + "/?modal=add-drive", { waitUntil: "networkidle", timeout: 90000 });
await page.getByText("Reject all cookies").click().catch(() => {});
await settle(page, 600);
await page.getByPlaceholder("Drive URL").fill("http://localhost:7809/d/JHOXJOdvW1k1VQCK_nisJxgmpi0HK6P7GK8O6-idyjo");
await page.getByRole("button", { name: "Add drive" }).click();
for (let i = 0; i < 6; i++) { await page.waitForTimeout(1500); }
console.log("URL", page.url());
console.log("BODY", JSON.stringify((await page.locator("body").innerText()).slice(0, 300)));
console.log("ERRORS", JSON.stringify(errors.slice(0, 5)));
await context.close();
