import { open, shot, BASE } from "./lib.mjs";
for (const scheme of ["light", "dark"]) {
  const { browser, page, logs } = await open({ colorScheme: scheme });
  await page.goto(BASE + "/settings/inventory", { waitUntil: "domcontentloaded" });
  await page.getByTestId("inventory-settings").waitFor({ timeout: 90000 }).catch((e) => console.log("no settings tab", e.message));
  const reject = page.getByRole("button", { name: "Reject all cookies" });
  await reject.waitFor({ timeout: 15000 }).then(() => reject.click()).catch(() => {});
  await page.waitForTimeout(1500);
  console.log(`[${scheme}] html class:`, await page.evaluate(() => document.documentElement.className), "title:", await page.title());
  console.log(`[${scheme}] tabs:`, (await page.locator('a[href^="/settings/"]').allInnerTexts()).map((t) => t.trim()).join(", "));
  await shot(page, `16-settings-${scheme}`);
  const vars = await page.evaluate(() => { const cs = getComputedStyle(document.documentElement); return ["--primary", "--primary-foreground", "--background"].map((v) => `${v}=${cs.getPropertyValue(v).trim()}`).join(" "); });
  console.log(`[${scheme}] tokens:`, vars);
  // sidebar extra item -> full page report
  await page.evaluate(() => { window.__marker = 1; });
  await page.locator('a[href="/report"]').first().click();
  await page.getByTestId("report-page").waitFor({ timeout: 30000 });
  await page.waitForTimeout(2000);
  console.log(`[${scheme}] report: no reload:`, await page.evaluate(() => window.__marker === 1), "| title:", await page.title(), "| sidebar links:", await page.locator('a[href^="/d/"]').count(), "|", await page.getByTestId("report-total").innerText().catch(() => "n/a"));
  const btn = await page.evaluate(() => { const a = document.querySelector('[data-testid="report-page"] a'); return a ? getComputedStyle(a).color : null; });
  console.log(`[${scheme}] report link color:`, btn);
  await shot(page, `17-report-${scheme}`);
  await page.goto(BASE + "/inventory", { waitUntil: "domcontentloaded" });
  await page.getByTestId("new-item").waitFor({ timeout: 60000 });
  await page.waitForTimeout(1000);
  console.log(`[${scheme}] new-item bg/fg:`, await page.getByTestId("new-item").evaluate((el) => `${getComputedStyle(el).backgroundColor} / ${getComputedStyle(el).color}`));
  await shot(page, `18-inventory-${scheme}`);
  if (logs.length) console.log("LOGS:\n" + logs.join("\n"));
  await browser.close();
}
