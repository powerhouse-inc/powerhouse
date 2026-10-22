import { chromium } from "/home/user/powerhouse/test/package-e2e/node_modules/@playwright/test/index.mjs";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
for (const scheme of ["light", "dark"]) {
  const ctx = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1400, height: 900 }, colorScheme: scheme });
  const page = await ctx.newPage();
  await page.goto("http://localhost:4173/inventory");
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `/tmp/connect-eval2/shots/60-loading-shell-${scheme}.png` });
  console.log(scheme, (await page.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 200), "| html.dark:", await page.evaluate(() => document.documentElement.className).catch(() => "n/a"));
  await ctx.close();
}
await browser.close();
