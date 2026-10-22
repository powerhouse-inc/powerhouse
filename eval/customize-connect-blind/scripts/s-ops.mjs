import { boot } from "./common.mjs";
export default async (page, { shot }) => {
  await boot(page, "/d/preview-362e4525/bolts-m8-OjdryZe9zx4j67ksGUPhHD9IqakNurKulS0ZgeB6qsg", /Bolts M8|Add this item|Steel/);
  await page.waitForTimeout(3000);
  console.log("ops:", await page.evaluate(() => JSON.stringify(globalThis.__ops)?.slice(0, 300)));
  console.log((await page.locator("body").innerText()).slice(0, 500));
  await shot("04-editor-new");
};
