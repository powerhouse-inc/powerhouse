export default async ({ page, BASE, shot, text, dismissCookies }) => {
  await page.goto(`${BASE}/settings`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(7000);
  await dismissCookies();
  console.log("URL:", page.url());
  console.log("SETTINGS:", await text("body", 1200));
  const tab = page.getByText("Default Editors").first();
  if (await tab.isVisible().catch(() => false)) {
    await tab.click();
    await page.waitForTimeout(1500);
    console.log("URL:", page.url());
    await shot("05-default-editors");
    console.log("DEFAULT EDITORS:", await text("body", 1500));
  }
};
