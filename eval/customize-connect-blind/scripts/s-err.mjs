import { boot } from "./common.mjs";
export default async (page, { shot }) => {
  page.on("console", (m) => { if (m.type() === "warning" && /ONE|ONS/.test(m.text())) console.log(m.text().slice(0, 600)); });
  await boot(page, "/d/preview-362e4525/bolts-m8-OjdryZe9zx4j67ksGUPhHD9IqakNurKulS0ZgeB6qsg", /Steel bolt/);
  await page.getByLabel(/Change/).fill("-500");
  await page.getByRole("button", { name: "Adjust" }).click();
  await page.waitForTimeout(4000);
  console.log("alert:", await page.getByRole("alert").innerText().catch(() => "(none)"));
  await page.getByLabel("New location").fill("Aisle 7");
  await page.getByRole("button", { name: "Move" }).click();
  await page.waitForTimeout(4000);
  console.log("alert2:", await page.getByRole("alert").allInnerTexts());
  await shot("05-editor-errors");
};
