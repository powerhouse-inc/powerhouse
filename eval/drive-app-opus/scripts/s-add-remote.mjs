// args: driveUrl
export default async ({ page, BASE, shot, text, dismissCookies, args }) => {
  await page.goto(BASE + "/?modal=add-drive", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(6000);
  await dismissCookies();
  const dlg = page.locator('[role="dialog"]').last();
  await dlg.getByText("Add Drive", { exact: true }).click();
  await page.waitForTimeout(800);
  console.log("ADD TAB:", await text('[role="dialog"]', 600));
  const input = dlg.locator("input").first();
  await input.fill(args[0]);
  await page.waitForTimeout(3000);
  await shot("41-add-remote-drive");
  console.log("AFTER URL:", await text('[role="dialog"]', 800));
  const btn = dlg.getByRole("button", { name: /add drive|add new drive|add/i }).last();
  console.log("button:", await btn.innerText(), "enabled:", await btn.isEnabled());
  await btn.click();
  await page.waitForTimeout(6000);
  await dlg.getByRole("button", { name: "Add new drive" }).click();
  await page.waitForTimeout(6000);
  console.log("URL:", page.url());
  await shot("42-after-add-remote");
  console.log("PAGE:", await text("body", 800));
};
