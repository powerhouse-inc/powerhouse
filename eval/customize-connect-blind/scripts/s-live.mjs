import { boot } from "./common.mjs";
import { execSync } from "node:child_process";
const mcp = (tool, args) => execSync(`node /tmp/connect-eval2/scripts/mcp.mjs ${tool} '${JSON.stringify(args)}'`).toString().trim();
export default async (page, { shot }) => {
  await boot(page, "/inventory", /Every inventory item/);
  await page.waitForTimeout(2000);
  while (await page.getByRole("button", { name: "Load more" }).isVisible().catch(() => false)) { await page.getByRole("button", { name: "Load more" }).click(); await page.waitForTimeout(1500); }
  const row = () => page.locator("tr", { hasText: "Washer M8" }).innerText().then((t) => t.replace(/\s+/g, " "));
  console.log("before:", await row(), "| rows", await page.locator("tbody tr").count());
  console.log(mcp("addActions", { documentId: "sfMBw9ftRBLJS6XCTvQLXIm2EnZ21Z1MpuUfE8MySxs", actions: [{ type: "ADJUST_QUANTITY", scope: "global", input: { delta: 42, reason: "restock" } }] }));
  const r = mcp("createDocument", { documentType: "stock-app/inventory-item", name: "Live test item", driveId: "S4WKh1bauxXN4bO56eMweVSafnCJ4dW81Y6t1IOTzWE" });
  const id = JSON.parse(r).documentId;
  console.log(mcp("addActions", { documentId: id, actions: [{ type: "ADD_ITEM", scope: "global", input: { name: "Live test item", quantity: 1, location: "B-09" } }] }));
  for (let i = 0; i < 10; i++) {
    await page.waitForTimeout(2000);
    const t = await row(); const n = await page.locator("tbody tr").count();
    const live = await page.locator("tr", { hasText: "Live test item" }).count();
    console.log(`t+${(i + 1) * 2}s:`, t, "| rows", n, "| live row", live, "| shown", await page.getByTestId("shown-count").innerText());
    if (t.includes(" 50 ") && live) break;
  }
  await shot("70-live-update");
};
