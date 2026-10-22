// args: driveSlug
export default async ({ page, BASE, shot, text, dismissCookies, args, mark, stillSamePage }) => {
  const slug = args[0];
  await page.goto(`${BASE}/d/${slug}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(7000);
  await dismissCookies();
  await shot("10-app-empty");
  console.log("EMPTY:", await text("main", 400));
  await mark();
  // create folders
  const nf = page.getByLabel("New folder name");
  await nf.fill("Shelf A");
  await page.getByRole("button", { name: "Add folder" }).click();
  await page.waitForTimeout(800);
  await nf.fill("Shelf B");
  await page.getByRole("button", { name: "Add folder" }).click();
  await page.waitForTimeout(1500);
  console.log("TREE:", await text('nav[aria-label="Folders"]', 300));
  // select Shelf A
  await page.getByRole("treeitem", { name: /Shelf A/ }).click();
  await page.waitForTimeout(1500);
  console.log("URL after folder select:", page.url(), "same page:", await stillSamePage());
  console.log("TITLE:", await text('[data-testid="folder-title"]'));
  // create an inventory item via the modal
  await page.getByRole("button", { name: "+ New inventory item" }).click();
  await page.waitForTimeout(1500);
  console.log("URL with modal:", page.url());
  await shot("11-create-modal");
  console.log("MODAL:", await text('[role="dialog"]', 600));
};
