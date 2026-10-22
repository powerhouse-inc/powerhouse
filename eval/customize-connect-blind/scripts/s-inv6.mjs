import { boot } from "./common.mjs";
export default async (page, { shot }) => {
  await boot(page, "/d/warehouse-b-S4WKh1bauxXN4bO56eMweVSafnCJ4dW81Y6t1IOTzWE?modal=create-document&documentType=stock-app%2Finventory-item", /Create a new document/);
  const dlg = page.getByRole("dialog");
  await dlg.getByPlaceholder("Document name").fill("Zip ties");
  await dlg.getByRole("button", { name: "Create" }).click();
  await page.waitForTimeout(4000);
  console.log("url:", page.url());
};
