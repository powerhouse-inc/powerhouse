import { boot, text } from "./common.mjs";
export default async (page, { shot }) => {
  await boot(page);
  await page.getByText("Vetra Preview").first().click();
  await page.waitForTimeout(3000);
  console.log(page.url());
  await shot("02-preview-drive");
  console.log(await text(page));
};
