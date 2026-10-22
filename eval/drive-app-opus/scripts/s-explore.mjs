export default async ({ page, BASE, shot, text, dismissCookies }) => {
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(8000);
  await dismissCookies();
  await page.waitForTimeout(500);
  await shot("02-home-nocookies");
  console.log("HOME:", await text());
  const links = await page.locator("a").evaluateAll((as) => as.map((a) => `${a.textContent?.trim()} -> ${a.getAttribute("href")}`));
  console.log("LINKS:", links.join(" ; "));
};
