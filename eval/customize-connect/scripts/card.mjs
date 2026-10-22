import { open, shot, BASE } from "./lib.mjs";
const { browser, page } = await open();
await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
await page.locator('main a[href^="/d/"]').first().waitFor({ timeout: 90000 }).catch(() => {});
await page.waitForTimeout(1500);
const info = await page.evaluate(() => {
  const c = document.querySelector('[data-testid="inventory-card"]');
  if (!c) return "no card";
  const r = c.getBoundingClientRect();
  const cs = getComputedStyle(c);
  const chain = [];
  for (let e = c; e && chain.length < 6; e = e.parentElement) chain.push(`${e.tagName}.${(e.className || "").toString().slice(0, 120)}`);
  const drive = document.querySelector('main a[href^="/d/"]');
  return { rect: [r.x, r.y, r.width, r.height], display: cs.display, visibility: cs.visibility, opacity: cs.opacity, chain, driveOuter: drive?.outerHTML.slice(0, 600), driveParent: drive?.parentElement?.className };
});
console.log(JSON.stringify(info, null, 1));
await page.screenshot({ path: "/tmp/connect-eval/shots/20-card.png", clip: { x: 0, y: 0, width: 1280, height: 260 } });
console.log("drive cards:", await page.locator('a[href^="/d/"]').count());
await browser.close();
