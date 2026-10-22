import { boot } from "./common.mjs";
export default async (page, { shot }) => {
  await boot(page, "/inventory", /Every inventory item/);
  await page.waitForTimeout(2500);
  await shot("80-phone-inventory");
  console.log("scrollWidth", await page.evaluate(() => document.documentElement.scrollWidth), "inner", await page.evaluate(() => innerWidth));
};
