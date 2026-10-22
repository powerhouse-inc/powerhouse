// args: tag [query]   — screenshots of the main views (Stockroom North drive)
export default async ({ page, BASE, shot, text, dismissCookies, args }) => {
  const [tag, q = ""] = args;
  const slug = "stockroom-north-JOCebMSL70QkFqIC_gMs-LU9fowBQU9HgoSgJOaGpBA";
  await page.goto(`${BASE}/d/${slug}${q}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(7000);
  await dismissCookies();
  console.log("html class:", await page.evaluate(() => document.documentElement.className));
  console.log("body bg:", await page.evaluate(() => getComputedStyle(document.body).backgroundColor), "app bg:", await page.evaluate(() => { const e = document.querySelector('[data-testid="stockroom-app"]'); return e ? getComputedStyle(e).backgroundColor + " / " + getComputedStyle(e).color : "none"; }));
  await page.getByRole("treeitem", { name: /Aisle 1/ }).click();
  await page.waitForTimeout(2000);
  await shot(`${tag}-folder`);
  const sw = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  console.log("scrollWidth vs viewport:", sw.join(" / "));
  await page.locator('[data-testid="item-row"]').first().locator("td").nth(1).click();
  await page.waitForTimeout(2500);
  await shot(`${tag}-document`);
  const sw2 = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  console.log("doc scrollWidth vs viewport:", sw2.join(" / "));
  await page.getByRole("button", { name: "← Back to stockroom" }).click();
  await page.waitForTimeout(1500);
  await page.getByRole("treeitem", { name: /Aisle 2/ }).click();
  await page.waitForTimeout(1500);
  await shot(`${tag}-other-docs`);
  await page.goto(`${BASE}/stockroom${q}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(5000);
  await shot(`${tag}-stockroom-page`);
};
