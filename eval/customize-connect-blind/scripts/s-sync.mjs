import { boot } from "./common.mjs";
export default async (page) => {
  await boot(page, "/d/preview-362e4525", /Documents and files/);
  await page.waitForTimeout(15000);
  console.log((await page.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 400));
};
