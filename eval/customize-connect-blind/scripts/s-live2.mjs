import { boot } from "./common.mjs";
import { execSync } from "node:child_process";
const mcp = (tool, args) => execSync(`node /tmp/connect-eval2/scripts/mcp.mjs ${tool} '${JSON.stringify(args)}'`).toString().trim();
const names = async (page) => (await page.locator("tbody tr td:first-child").allInnerTexts()).map((s) => s.replace(" (not added yet)", "*"));
export default async (page) => {
  await boot(page, "/inventory", /Every inventory item/);
  await page.waitForTimeout(2000);
  while (await page.getByRole("button", { name: "Load more" }).isVisible().catch(() => false)) { await page.getByRole("button", { name: "Load more" }).click(); await page.waitForTimeout(1500); }
  const before = await names(page);
  console.log("before", before.length, await page.getByTestId("shown-count").innerText());
  const r = mcp("createDocument", { documentType: "stock-app/inventory-item", name: "Live test 2", driveId: "preview-362e4525" });
  await page.waitForTimeout(5000);
  const after = await names(page);
  console.log("after", after.length, await page.getByTestId("shown-count").innerText());
  console.log("added:", after.filter((n) => !before.includes(n)), "dropped:", before.filter((n) => !after.includes(n)));
  if (await page.getByRole("button", { name: "Load more" }).isVisible()) { await page.getByRole("button", { name: "Load more" }).click(); await page.waitForTimeout(2000); const more = await names(page); console.log("after load more", more.length, await page.getByTestId("shown-count").innerText(), "dupes:", more.length - new Set(more).size); }
};
