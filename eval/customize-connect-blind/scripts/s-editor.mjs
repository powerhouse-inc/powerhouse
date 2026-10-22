import { boot } from "./common.mjs";
export default async (page, { shot }) => {
  await boot(page, "/d/preview-362e4525/bolts-m8-OjdryZe9zx4j67ksGUPhHD9IqakNurKulS0ZgeB6qsg", /Add this item/);
  await page.getByLabel("Name").fill("Steel bolt M8");
  await page.getByLabel("SKU").fill("BOLT-M8");
  await page.getByLabel("Starting quantity").fill("100");
  await page.getByLabel("Location", { exact: true }).fill("Aisle 3");
  await page.getByRole("button", { name: "Add item" }).click();
  await page.getByTestId("quantity").waitFor({ timeout: 10000 });
  await page.getByLabel(/Change/).fill("-30");
  await page.getByLabel("Reason").fill("Order 42");
  await page.getByRole("button", { name: "Adjust" }).click();
  await page.waitForTimeout(800);
  await page.getByLabel("New location").fill("Aisle 7");
  await page.getByRole("button", { name: "Move" }).click();
  await page.waitForTimeout(800);
  console.log("qty", await page.getByTestId("quantity").innerText(), "loc", await page.getByTestId("location").innerText());
  // error path: oversell
  await page.getByLabel(/Change/).fill("-500");
  await page.getByRole("button", { name: "Adjust" }).click();
  await page.waitForTimeout(1200);
  console.log("alert:", await page.getByRole("alert").innerText().catch(() => "(none)"));
  console.log("qty after oversell", await page.getByTestId("quantity").innerText());
  await shot("05-editor-used");
};
