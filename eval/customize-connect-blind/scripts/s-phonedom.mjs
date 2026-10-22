import { boot } from "./common.mjs";
export default async (page) => {
  await boot(page, "/inventory", /Every inventory item|Inventory/);
  await page.waitForTimeout(2000);
  const out = await page.evaluate(() => {
    const walk = (e, d) => d > 4 || !e ? "" : "  ".repeat(d) + e.tagName + "." + String(e.className).slice(0, 110) + " [" + Math.round(e.getBoundingClientRect().width) + "x" + Math.round(e.getBoundingClientRect().height) + "]\n" + [...e.children].slice(0, 3).map((c) => walk(c, d + 1)).join("");
    return walk(document.querySelector("#root") ?? document.body.firstElementChild, 0);
  });
  console.log(out);
};
