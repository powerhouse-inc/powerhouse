import { boot } from "./common.mjs";
export default async (page, { shot }) => {
  await boot(page, "/inventory", /Every inventory item/);
  await page.waitForTimeout(1500);
  await page.getByLabel("New items go to").selectOption({ label: "Warehouse B" });
  await page.waitForTimeout(500);
  console.log("url after select:", page.url());
  await page.getByRole("link", { name: "New inventory item" }).click();
  const dlg = page.getByRole("dialog");
  await dlg.getByPlaceholder("Document name").fill("Stretch film");
  await shot("26-create-modal-with-target");
  await dlg.getByRole("button", { name: "Create" }).click();
  await page.waitForTimeout(4000);
  console.log("url after create:", page.url());
  await shot("27-after-create-with-target");
};
