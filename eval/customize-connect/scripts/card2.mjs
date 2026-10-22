import { open, BASE } from "./lib.mjs";
const { browser, page } = await open();
await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
await page.getByTestId("inventory-card").waitFor({ timeout: 90000 });
await page.waitForTimeout(2500);
const info = await page.evaluate(() => {
  const c = document.querySelector('[data-testid="inventory-card"]');
  const r = c.getBoundingClientRect();
  const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
  const span = c.querySelector("span");
  const cs = getComputedStyle(span);
  const siblings = [...c.parentElement.children].map((e) => `${e.tagName}[${e.getAttribute("data-testid") ?? ""}] ${JSON.stringify(e.getBoundingClientRect().toJSON())}`);
  return { rect: r.toJSON(), top: top?.outerHTML.slice(0, 300), color: cs.color, spanRect: span.getBoundingClientRect().toJSON(), cardBg: getComputedStyle(c).backgroundColor, cardBorder: getComputedStyle(c).borderColor, siblings };
});
console.log(JSON.stringify(info, null, 1));
await browser.close();
