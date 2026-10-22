export default async ({ page, BASE, shot, text, dismissCookies }) => {
  await page.goto(`${BASE}/d/preview-10729350`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(7000);
  await dismissCookies();
  await shot("50-preview-drive-explorer");
  console.log("PAGE:", await text("body", 600));
  // right click the active drive icon in Connect's sidebar
  const side = page.locator('a[href="/d/preview-10729350"]').first();
  await side.hover();
  await page.waitForTimeout(800);
  await side.click({ button: "right" });
  await page.waitForTimeout(800);
  await shot("51-preview-sidebar-context");
  console.log("MENU:", await text("body", 800));
  const btns = await page.locator("button[aria-label], [role=menuitem]").evaluateAll((bs) => bs.map((b) => b.getAttribute("aria-label") || b.textContent?.trim()).filter(Boolean));
  console.log("BUTTONS:", btns.join(" ; ").slice(0, 600));
};
