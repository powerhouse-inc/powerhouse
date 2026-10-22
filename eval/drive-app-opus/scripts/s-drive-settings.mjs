// args: driveId
export default async ({ page, BASE, shot, text, dismissCookies, args }) => {
  await page.goto(`${BASE}/?modal=drive-settings&driveId=${args[0]}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(7000);
  await dismissCookies();
  await shot("04-drive-settings");
  console.log("MODAL:", await text('[role="dialog"]', 1500));
};
