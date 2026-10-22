import { boot } from "./common.mjs";
export default async (page, { shot }) => {
  await boot(page, "/?theme=dark", /Vetra Preview/);
  await page.waitForTimeout(1500);
  console.log("url", page.url(), "dark:", await page.evaluate(() => document.documentElement.classList.contains("dark")), "primary:", await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--primary")));
  await page.locator('a[href^="/inventory"]').first().click();
  await page.getByRole("heading", { name: "Inventory" }).waitFor();
  console.log("after nav url", page.url(), "dark:", await page.evaluate(() => document.documentElement.classList.contains("dark")));
  await page.goto("http://localhost:2987/?theme=light");
  await page.waitForTimeout(3000);
  console.log("reset dark:", await page.evaluate(() => document.documentElement.classList.contains("dark")));
};
