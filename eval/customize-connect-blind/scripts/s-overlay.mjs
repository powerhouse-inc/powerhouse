import { boot } from "./common.mjs";
export default async (page, { shot }) => {
  await page.goto("http://localhost:2987/inventory");
  await page.waitForTimeout(8000);
  await shot("63-studio-shell-error");
  console.log((await page.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 300));
  const overlay = await page.locator("vite-error-overlay").count();
  console.log("vite overlay:", overlay, overlay ? (await page.locator("vite-error-overlay").evaluate((e) => e.shadowRoot?.textContent?.slice(0, 300))) : "");
};
