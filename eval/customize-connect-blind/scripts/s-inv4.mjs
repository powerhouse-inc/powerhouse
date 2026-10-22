import { boot } from "./common.mjs";
export default async (page, { shot }) => {
  page.on("console", (m) => { if (["warning","error"].includes(m.type())) console.log("CONSOLE", m.type(), m.text().slice(0, 300)); });
  await boot(page, "/inventory", /Every inventory item/);
  await page.waitForTimeout(1500);
  while (await page.getByRole("button", { name: "Load more" }).isVisible().catch(() => false)) { await page.getByRole("button", { name: "Load more" }).click(); await page.waitForTimeout(1500); }
  console.log((await page.locator('table tbody tr').allInnerTexts()).map((r) => r.replace(/\s+/g, " ")));
  console.log("selected drive:", await page.evaluate(() => window.ph?.selectedDriveId ?? Object.keys(window.ph ?? {}).slice(0, 40).join(",")));
  await page.getByRole("link", { name: "New inventory item" }).click();
  const dlg = page.getByRole("dialog");
  await dlg.getByPlaceholder("Document name").fill("Zip ties 2");
  await dlg.getByRole("button", { name: "Create" }).click();
  await page.waitForTimeout(4000);
  console.log("url:", page.url());
};
