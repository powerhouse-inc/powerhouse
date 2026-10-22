import { boot } from "./common.mjs";
export default async (page, { shot }) => {
  await boot(page, "/d/warehouse-b-S4WKh1bauxXN4bO56eMweVSafnCJ4dW81Y6t1IOTzWE", /Packing tape/);
  await page.locator('a[href="/inventory"]').first().click();
  await page.getByRole("heading", { name: "Inventory" }).waitFor();
  await page.waitForTimeout(1500);
  await page.getByRole("link", { name: "New inventory item" }).click();
  const dlg = page.getByRole("dialog");
  await dlg.getByPlaceholder("Document name").fill("Zip ties");
  await dlg.getByRole("button", { name: "Create" }).click();
  await page.waitForTimeout(4000);
  console.log("url:", page.url());
  await shot("25-create-after-visiting-drive");
};
