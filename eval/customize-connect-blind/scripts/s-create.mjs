import { boot, text } from "./common.mjs";
export default async (page, { shot }) => {
  await boot(page, "/d/preview-362e4525");
  await page.getByRole("button", { name: /Create New Document/ }).click();
  await page.waitForTimeout(1500);
  await shot("03-create-menu");
  console.log(page.url());
  console.log((await page.locator("body").innerText()).slice(0, 600));
};
