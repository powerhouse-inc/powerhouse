import { boot } from "./common.mjs";
export default async (page, { shot }) => {
  await boot(page, "/", /Vetra Preview/);
  await page.waitForTimeout(2000);
  const info = await page.getByTestId("inventory-card").evaluate((el) => {
    const out = [];
    let e = el;
    for (let i = 0; i < 6 && e; i++, e = e.parentElement) {
      const r = e.getBoundingClientRect(); const cs = getComputedStyle(e);
      out.push(`${e.tagName}.${(e.className||"").toString().slice(0,90)} rect=${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.width)}x${Math.round(r.height)} vis=${cs.visibility} op=${cs.opacity} disp=${cs.display} ov=${cs.overflow}`);
    }
    return out.join("\n");
  });
  console.log(info);
  const sib = await page.getByText("Vetra Preview").first().evaluate((el) => { let e = el; for (let i=0;i<4;i++) e = e.parentElement; return e.outerHTML.slice(0, 1500); });
  console.log(sib);
};
