// args: driveSlug folderName itemName qty location
// Creates an inventory item in <folder> through the app's button + Connect's modal,
// fills it in the editor, comes back, and reports the table.
export default async ({ page, BASE, shot, text, dismissCookies, args, mark, stillSamePage }) => {
  const [slug, folderName, itemName, qty, loc] = args;
  await page.goto(`${BASE}/d/${slug}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(6000);
  await dismissCookies();
  await mark();
  if (folderName !== "-") {
    await page.getByRole("treeitem", { name: new RegExp(folderName) }).click();
    await page.waitForTimeout(1000);
  }
  const before = page.url();
  await page.getByRole("button", { name: "+ New inventory item" }).click();
  const dlg = page.locator('[role="dialog"]').last();
  await dlg.getByPlaceholder("Document name").fill(itemName);
  await dlg.getByRole("button", { name: "Create" }).click();
  await page.waitForTimeout(3000);
  console.log("from:", before);
  console.log("after create URL:", page.url(), "| same page:", await stillSamePage());
  await shot(`20-after-create-${itemName}`);
  console.log("MAIN:", await text("main", 500));
  // fill the editor's register form
  await page.getByLabel("Starting quantity").fill(qty);
  await page.getByLabel("Location").fill(loc);
  await page.getByRole("button", { name: "Add item" }).click();
  await page.waitForTimeout(1500);
  console.log("SUMMARY:", await text('[data-testid="item-summary"]', 200));
  await page.getByRole("button", { name: "← Back to stockroom" }).click();
  await page.waitForTimeout(2000);
  console.log("back URL:", page.url(), "| same page:", await stillSamePage());
  console.log("TABLE:", await text('[data-testid="items-table"]', 600));
  await shot(`21-table-after-${itemName}`);
};
