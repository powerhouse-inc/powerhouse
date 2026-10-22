import { boot } from "./common.mjs";
export default async (page, { shot }) => {
  const s = process.env.SCHEME || "light";
  let loads = 0; page.on("load", () => loads++);
  await boot(page, "/", /Vetra Preview/);
  loads = 0;
  // Sidebar "Stock report" extra item (router navigation)
  await page.getByRole("link", { name: "Stock report", description: "Full-page stock totals by location" }).click();
  await page.getByRole("heading", { name: "Stock report" }).waitFor();
  await page.waitForTimeout(2500);
  console.log("url", page.url(), "title", await page.title(), "loads", loads);
  console.log("sidebar present:", await page.locator('a[href="/inventory"]').count());
  console.log((await page.locator("table tbody tr").allInnerTexts()).map((r) => r.replace(/\s+/g, " ")));
  await shot(`50-stock-report-${s}`);
  await page.getByRole("link", { name: "← Back to inventory" }).click();
  await page.getByRole("heading", { name: "Inventory" }).waitFor();
  console.log("back ->", page.url(), "loads", loads);
  // Sidebar Inventory nav link active state
  console.log("nav aria-current:", await page.locator('a[href="/inventory"]').first().getAttribute("aria-current"));
  // Home card link
  await page.locator('a[href="/"]').first().click().catch(() => {});
  await page.goto(page.url().replace(/\/inventory.*/, "/"));
  await page.getByTestId("inventory-card").waitFor();
  await page.waitForTimeout(2000);
  await shot(`51-home-${s}`);
  await page.getByTestId("inventory-card").getByRole("link", { name: "Open inventory →" }).click();
  await page.getByRole("heading", { name: "Inventory" }).waitFor();
  console.log("card link ->", page.url());
  // Editor in this scheme
  await page.getByRole("link", { name: "Anchor bolt 10mm" }).click().catch(async () => { await page.getByRole("button", { name: "Load more" }).click(); await page.getByRole("link", { name: "Anchor bolt 10mm" }).click(); });
  await page.getByTestId("quantity").waitFor();
  await page.waitForTimeout(1500);
  await shot(`52-editor-${s}`);
};
