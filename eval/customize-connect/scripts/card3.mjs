import { open, BASE } from "./lib.mjs";
const { browser, page } = await open();
await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
await page.getByTestId("inventory-card").waitFor({ timeout: 90000 });
await page.locator('a[href^="/d/"]').nth(2).waitFor();
await page.waitForTimeout(1500);
console.log(await page.evaluate(() => {
  const c = document.querySelector('[data-testid="inventory-card"]').parentElement;
  return [c.children[0].outerHTML.slice(0, 700), "----", c.children[2].outerHTML.slice(0, 900), "----", c.children[4]?.outerHTML.slice(0,300)].join("\n");
}));
await browser.close();
