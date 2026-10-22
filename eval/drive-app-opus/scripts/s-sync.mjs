export default async ({ page, BASE, shot, text, dismissCookies }) => {
  const slug = "stockroom-north-JOCebMSL70QkFqIC_gMs-LU9fowBQU9HgoSgJOaGpBA";
  await page.goto(`${BASE}/d/${slug}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(7000);
  await dismissCookies();
  // UI: move Gloves (root) to Aisle 2 and add a folder under Aisle 2
  await page.getByLabel("Move Gloves to folder").selectOption({ label: "Aisle 2" });
  await page.waitForTimeout(1500);
  await page.getByRole("treeitem", { name: /Aisle 2/ }).click();
  await page.waitForTimeout(1000);
  await page.getByLabel("New folder name").fill("Returns");
  await page.getByRole("button", { name: "Add folder" }).click();
  await page.waitForTimeout(1500);
  console.log("tree:", await text('nav[aria-label="Folders"]', 300));
  await page.getByRole("treeitem", { name: /Aisle 1/ }).first().click();
  await page.waitForTimeout(500);
  console.log("Aisle 1 before reactor move:", await text('[data-testid="items-table"]', 300));
  console.log("READY_FOR_MCP");
  const t0 = Date.now();
  let seen = false;
  while (Date.now() - t0 < 30000) {
    const t = await text("main", 600);
    if (t.includes("Saw")) { seen = true; break; }
    await page.waitForTimeout(1000);
  }
  console.log("reactor move visible live:", seen, "after", Date.now() - t0, "ms");
  console.log("Aisle 1 now:", await text('[data-testid="items-table"]', 300));
  await shot("91-live-sync");
};
