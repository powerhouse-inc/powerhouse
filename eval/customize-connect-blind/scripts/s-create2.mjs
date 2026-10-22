import { boot } from "./common.mjs";
export default async (page, { shot }) => {
  let loads = 0; page.on("load", () => loads++);
  await boot(page, "/inventory", /Every inventory item/);
  loads = 0;
  await page.waitForTimeout(1500);
  await shot("26-inventory-new-in-drive");
  // A: routed modal via per-drive link
  await page.getByRole("link", { name: "Vetra Preview" }).last().click();
  const dlg = page.getByRole("dialog");
  await dlg.getByPlaceholder("Document name").waitFor({ timeout: 10000 });
  console.log("A url:", page.url(), "loads", loads);
  await dlg.getByPlaceholder("Document name").fill("Anchor bolts");
  await dlg.getByRole("button", { name: "Create" }).click();
  await page.getByText("Add this item to stock").waitFor({ timeout: 15000 });
  console.log("A created ->", page.url());
  await page.getByLabel("Name").fill("Anchor bolt 10mm");
  await page.getByLabel("Starting quantity").fill("3");
  await page.getByLabel("Location", { exact: true }).fill("Aisle 9");
  await page.getByRole("button", { name: "Add item" }).click();
  await page.getByTestId("quantity").waitFor();
  // B: in-place modal from the editor
  const link = page.getByRole("link", { name: "+ New item in this drive" });
  console.log("B href:", await link.getAttribute("href"));
  await link.click();
  await dlg.getByPlaceholder("Document name").waitFor({ timeout: 10000 });
  console.log("B url:", page.url(), "loads", loads);
  await shot("28-editor-modal-in-place");
  await dlg.getByPlaceholder("Document name").fill("Cable ties");
  await dlg.getByRole("button", { name: "Create" }).click();
  await page.getByText("Add this item to stock").waitFor({ timeout: 15000 });
  console.log("B created ->", page.url(), "loads", loads);
};
