export default async ({ page, BASE, shot, text, dismissCookies, mark, stillSamePage }) => {
  const slug = "stockroom-north-JOCebMSL70QkFqIC_gMs-LU9fowBQU9HgoSgJOaGpBA";
  await page.goto(`${BASE}/d/${slug}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(7000);
  await dismissCookies();
  await mark();
  await page.getByRole("treeitem", { name: /Aisle 2/ }).click();
  await page.waitForTimeout(1500);
  await page.getByTestId("other-docs").getByRole("link", { name: "Spec sheet" }).click();
  await page.waitForTimeout(4000);
  console.log("URL:", page.url(), "| no reload:", await stillSamePage());
  await shot("90-other-doc-open");
  console.log("MAIN:", await text("main", 500));
  await page.goBack();
  await page.waitForTimeout(1500);
  console.log("back:", page.url(), await text('[data-testid="folder-title"]').catch(() => "?"));
};
