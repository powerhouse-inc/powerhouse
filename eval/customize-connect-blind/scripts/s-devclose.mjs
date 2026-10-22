import { boot } from "./common.mjs";
export default async (page) => {
  await boot(page, "/", /Vetra Preview/);
  console.log(await page.evaluate(() => Object.keys(localStorage).filter((k) => /tanstack/i.test(k)).map((k) => k + "=" + localStorage.getItem(k))));
  await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (/tanstack/i.test(k) && /open/i.test(k)) localStorage.setItem(k, "false"); });
};
