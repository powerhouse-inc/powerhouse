// args: driveName [appName]
export default async ({ page, BASE, shot, text, dismissCookies, args }) => {
  const [name, app] = args;
  await page.goto(BASE + "/?modal=add-drive", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(6000);
  await dismissCookies();
  const dlg = page.locator('[role="dialog"]').last();
  await dlg.getByPlaceholder("Drive name").fill(name);
  if (app) {
    await dlg.getByText("Drive App").locator("..").locator("button, [role=button]").first().click().catch(async () => {
      await dlg.getByText("Stockroom App").click();
    });
    await page.waitForTimeout(800);
    await shot(`drive-app-picker`);
    console.log("PICKER:", await text('[role="dialog"]', 800));
    await page.getByText(app, { exact: true }).last().click();
    await page.waitForTimeout(500);
  }
  await dlg.getByRole("button", { name: "Create new drive" }).click();
  await page.waitForTimeout(4000);
  console.log("URL after create:", page.url());
  await shot(`created-${name.replace(/\W+/g, "-")}`);
  console.log("TEXT:", await text("body", 600));
};
