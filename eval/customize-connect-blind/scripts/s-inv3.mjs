import { boot } from "./common.mjs";
export default async (page, { shot }) => {
  await boot(page, "/inventory", /Every inventory item/);
  await page.waitForTimeout(1500);
  await page.getByRole("link", { name: "New inventory item" }).click();
  const dlg = page.getByRole("dialog");
  await dlg.getByPlaceholder("Document name").fill("Zip ties");
  await dlg.getByRole("button", { name: "Create" }).click();
  await page.waitForTimeout(4000);
  console.log("url after create:", page.url());
  console.log("dialog still open:", await dlg.isVisible().catch(() => false), (await dlg.innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 200));
  const toasts = await page.locator('[role="status"], .Toastify__toast, [data-sonner-toast]').allInnerTexts();
  console.log("toasts:", toasts);
  await shot("24-after-create-from-inventory");
};
