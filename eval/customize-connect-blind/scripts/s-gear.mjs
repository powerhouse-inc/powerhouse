import { boot } from "./common.mjs";
export default async (page, { shot }) => {
  await boot(page, "/", /Vetra Preview/);
  const gear = page.locator('a[href^="/settings"]').first();
  const box = await gear.boundingBox();
  console.log("gear box", JSON.stringify(box));
  const top = await page.evaluate(({ x, y }) => { const e = document.elementFromPoint(x, y); return e?.outerHTML.slice(0, 160); }, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
  console.log("element on top:", top);
  await page.screenshot({ path: "/tmp/connect-eval2/shots/41-gear-overlap.png", clip: { x: 0, y: 700, width: 300, height: 200 } });
};
