export default async ({ page, BASE, shot, text, dismissCookies, args }) => {
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(8000);
  await dismissCookies();
  await page.waitForTimeout(500);
  await shot(args[0] ?? "home");
  console.log("HOME:", await text("main, body", 800));
  const links = await page.locator("a[href^='/d/']").evaluateAll((as) => as.map((a) => `${a.textContent?.trim()} -> ${a.getAttribute("href")}`));
  console.log("DRIVE LINKS:", [...new Set(links)].join(" ; "));
};
