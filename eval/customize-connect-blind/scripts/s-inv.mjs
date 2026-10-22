import { boot } from "./common.mjs";
export default async (page, { shot }) => {
  await boot(page, "/", /Vetra Preview/);
  // Navigate via sidebar nav link (client-side)
  let reloaded = false;
  page.on("framenavigated", (f) => { if (f === page.mainFrame()) reloaded = true; });
  await page.locator('a[href="/inventory"]').first().click();
  await page.getByRole("heading", { name: "Inventory" }).waitFor();
  await page.waitForTimeout(2500);
  console.log("url", page.url(), "title", await page.title());
  await shot("20-inventory-page1");
  const rows = async () => (await page.locator('table[aria-label="Inventory items"] tbody tr').allInnerTexts()).map((r) => r.replace(/\s+/g, " "));
  console.log("page1:", await rows());
  console.log(await page.getByTestId("shown-count").innerText());
  let n = 0;
  while (await page.getByRole("button", { name: "Load more" }).isVisible().catch(() => false)) {
    await page.getByRole("button", { name: "Load more" }).click();
    await page.waitForTimeout(2000);
    console.log("after load more", ++n, ":", await page.getByTestId("shown-count").innerText());
    if (n > 5) break;
  }
  console.log("all:", await rows());
  await shot("21-inventory-all");
};
