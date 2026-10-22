import { boot } from "./common.mjs";
export default async (page, { shot }) => {
  await boot(page, "/inventory", /Every inventory item/);
  await page.waitForTimeout(2000);
  let loads = 0;
  page.on("load", () => loads++);
  // 1. open a document from the list
  await page.getByRole("link", { name: "Packing tape" }).click();
  await page.getByTestId("quantity").waitFor({ timeout: 15000 });
  console.log("doc url:", page.url(), "qty", await page.getByTestId("quantity").innerText(), "full loads:", loads);
  await shot("22-open-from-list");
  await page.goBack();
  await page.getByRole("heading", { name: "Inventory" }).waitFor();
  // 2. create through the modal link
  const link = page.getByRole("link", { name: "New inventory item" });
  console.log("modal href:", await link.getAttribute("href"));
  await link.click();
  await page.waitForTimeout(1500);
  console.log("url after modal click:", page.url(), "full loads:", loads);
  await shot("23-create-modal-from-inventory");
  const dlg = page.getByRole("dialog");
  console.log("dialog:", (await dlg.innerText().catch(() => "none")).replace(/\s+/g, " ").slice(0, 300));
};
