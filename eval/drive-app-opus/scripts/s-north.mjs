// args: driveSlug
export default async ({ page, BASE, shot, text, dismissCookies, args }) => {
  await page.goto(`${BASE}/d/${args[0]}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(7000);
  await dismissCookies();
  const tree = (n) => page.getByRole("treeitem", { name: new RegExp(n) });
  for (const f of ["Aisle 1", "Top shelf", "Aisle 2"]) {
    await tree(f).click();
    await page.waitForTimeout(2500);
    console.log(f, "=>", await text("main", 400));
    await shot(`43-north-${f.replace(/\W+/g, "-")}`);
  }
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(5000);
  console.log("HOME:", await text("body", 400));
};
