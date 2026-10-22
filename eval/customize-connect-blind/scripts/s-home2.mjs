import { boot } from "./common.mjs";
export default async (page, { shot }) => {
  const t0 = Date.now();
  await boot(page, "/", /Vetra Preview|Create New Drive|Inventory/);
  console.log("boot ms", Date.now() - t0);
  await page.waitForTimeout(4000);
  await shot("10-home");
  console.log("title:", await page.title());
  console.log((await page.locator("body").innerText()).slice(0, 700));
  console.log("nav links:", await page.locator("nav a, aside a").evaluateAll((as) => as.map((a) => (a.getAttribute("aria-label") || a.title || a.textContent || "").trim() + "->" + a.getAttribute("href")).join(" | ")));
};
