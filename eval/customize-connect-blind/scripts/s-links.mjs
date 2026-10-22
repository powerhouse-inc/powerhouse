import { boot } from "./common.mjs";
export default async (page) => {
  let loads = 0; page.on("load", () => loads++);
  await boot(page, "/", /Vetra Preview/); loads = 0;
  for (const name of ["Warehouse B", "Vetra Preview"]) {
    await page.goto("http://localhost:2987/"); await page.getByTestId("inventory-card").waitFor();
    loads = 0;
    await page.locator("main, body").getByRole("link", { name: new RegExp(name) }).filter({ hasText: "Drive" }).first().click();
    await page.getByText("Documents and files").waitFor({ timeout: 15000 });
    console.log(name, "card ->", page.url(), "loads", loads);
  }
  await page.goto("http://localhost:2987/inventory"); await page.getByRole("heading", { name: "Inventory" }).waitFor(); loads = 0;
  await page.locator("main a", { hasText: "Stock report" }).or(page.locator('a.border-border:has-text("Stock report")')).first().click();
  await page.getByRole("heading", { name: "Stock report" }).waitFor();
  console.log("header link ->", page.url(), "loads", loads);
  await page.goBack(); await page.getByRole("heading", { name: "Inventory" }).waitFor();
  console.log("back ->", page.url());
};
