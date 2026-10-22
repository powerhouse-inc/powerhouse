import { boot } from "./common.mjs";
export default async (page) => {
  page.on("response", (r) => { if (r.status() >= 400) console.log("HTTP", r.status(), r.url().slice(0, 150)); });
  await boot(page, "/settings/inventory", /Items per page/);
  await page.waitForTimeout(3000);
  await page.goto("http://localhost:2987/inventory"); await page.waitForTimeout(3000);
};
