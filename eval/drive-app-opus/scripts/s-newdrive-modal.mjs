export default async ({ page, BASE, shot, text, dismissCookies }) => {
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(6000);
  await dismissCookies();
  await page.getByText("Create New Drive").click();
  await page.waitForTimeout(1500);
  await shot("03-create-drive-modal");
  console.log("MODAL:", await text('[role="dialog"]', 1500));
  console.log("URL:", page.url());
  const selects = await page.locator('[role="dialog"] select, [role="dialog"] [role="combobox"]').count();
  console.log("selects:", selects);
};
