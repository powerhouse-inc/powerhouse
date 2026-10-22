import { boot } from "./common.mjs";
export default async (page) => {
  await boot(page, "/d/preview-362e4525", /Documents and files/);
  await page.waitForTimeout(2000);
  await page.getByRole("button", { name: /Create New Document/ }).click();
  await page.getByPlaceholder("Document name").fill(process.env.DOCNAME);
  await page.getByText("Select Document Type…").click();
  await page.getByText("InventoryItem V1").click();
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page.waitForURL(/\/d\/preview-362e4525\/.+/);
  await page.waitForTimeout(Number(process.env.WAIT || 0));
  console.log("created", page.url().split("/").pop());
};
