import { boot } from "./common.mjs";
export default async (page, { shot }) => {
  let loads = 0; page.on("load", () => loads++);
  await boot(page, "/", /Vetra Preview/);
  loads = 0;
  // open settings via sidebar gear (find link to /settings)
  const gear = page.locator('a[href^="/settings"]').first();
  console.log("settings link:", await gear.getAttribute("href"), await gear.getAttribute("aria-label"));
  await gear.evaluate((a) => a.click());
  await page.waitForTimeout(1500);
  console.log("url", page.url(), "title", await page.title());
  console.log("tabs:", (await page.locator('a[href^="/settings/"]').allInnerTexts()).map((t) => t.trim()).join(" | "));
  await page.locator('a[href="/settings/inventory"]').first().click();
  await page.getByLabel("Items per page").waitFor();
  console.log("url", page.url(), "title", await page.title(), "loads", loads);
  await page.getByLabel("Items per page").fill("3");
  await page.getByLabel("Low-stock threshold").fill("60");
  await page.getByRole("button", { name: "Save" }).click();
  console.log("status:", await page.getByRole("status").innerText());
  await shot("40-settings-tab");
  await page.goto(page.url().replace(/\/settings.*/, "/inventory"));
  await page.getByRole("heading", { name: "Inventory" }).waitFor();
  await page.waitForTimeout(2500);
  console.log("rows page1:", await page.locator('table tbody tr').count(), await page.getByTestId("shown-count").innerText());
  console.log("low-stock rows:", await page.locator("td.text-destructive").count());
  // reset
  await page.goto(page.url().replace("/inventory", "/settings/inventory"));
  await page.getByLabel("Items per page").fill("5"); await page.getByLabel("Low-stock threshold").fill("10");
  await page.getByRole("button", { name: "Save" }).click();
};
