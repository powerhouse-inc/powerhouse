// args: mode = "list" | "setapp:<driveName>" | "create:<itemName>[:<driveName>]"
export default async ({ page, BASE, shot, text, dismissCookies, args, mark, stillSamePage }) => {
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(7000);
  await dismissCookies();
  await mark();
  // reach the page through the sidebar link, as a user would
  await page.locator('a[href="/stockroom"]').first().click();
  await page.waitForTimeout(2000);
  console.log("URL:", page.url(), "| title:", await page.title(), "| no reload:", await stillSamePage());
  console.log("PAGE:", await text("main, body", 700));
  const [mode, a, b] = args[0].split(":");
  if (mode === "list") await shot("61-stockroom-page");
  if (mode === "setapp") {
    const row = page.locator("li", { hasText: a });
    await row.getByRole("button", { name: "Use Stockroom app" }).click();
    await page.waitForTimeout(2500);
    console.log("ROW after:", await row.innerText());
    await row.locator("a").click();
    await page.waitForTimeout(3000);
    console.log("drive URL:", page.url());
    console.log("app rendered:", await page.getByTestId("stockroom-app").isVisible().catch(() => false));
    await shot(`62-existing-drive-${a.replace(/\W+/g, "-")}`);
    console.log("DRIVE:", await text("main", 400));
  }
  if (mode === "create") {
    await page.getByRole("button", { name: "+ New inventory item" }).click();
    await page.waitForTimeout(1500);
    console.log("modal URL:", page.url());
    await shot((process.env.TAG ?? "") + "63-create-outside-drive-modal");
    const dlg = page.locator('[role="dialog"]').last();
    console.log("MODAL:", await dlg.innerText());
    await dlg.getByPlaceholder("Document name").fill(a);
    if (b) {
      // pick the drive if the modal asks
      const sel = dlg.locator("select");
      console.log("selected drive before:", await sel.first().evaluate((s) => s.options[s.selectedIndex]?.text));
      await sel.first().selectOption({ label: b });
    }
    await shot((process.env.TAG ?? "") + "64-create-outside-drive-filled");
    await dlg.getByRole("button", { name: "Create" }).click();
    await page.waitForTimeout(3500);
    console.log("after create URL:", page.url(), "| no reload:", await stillSamePage());
    console.log("app rendered:", await page.getByTestId("stockroom-app").isVisible().catch(() => false));
    await shot((process.env.TAG ?? "") + "65-after-create-outside-drive");
    console.log("PAGE:", await text("body", 500));
  }
};
