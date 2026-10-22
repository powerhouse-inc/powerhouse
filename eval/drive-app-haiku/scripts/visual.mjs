import { open, BASE, settle } from "./pwlib.mjs";
const DRIVE = BASE + "/d/stockroom-ui-aaY1R2GfWmknHeW2TPeaBfSkL3DkdJYXMd8VsJCu7hY";
const cases = [
  ["light-desktop", { width: 1280, height: 800 }, "light"],
  ["dark-desktop", { width: 1280, height: 800 }, "dark"],
  ["phone-light", { width: 390, height: 844 }, "light"],
  ["phone-dark", { width: 390, height: 844 }, "dark"],
];
for (const [name, vp, scheme] of cases) {
  const { context, page, errors } = await open(vp, scheme);
  await page.goto(DRIVE, { waitUntil: "networkidle", timeout: 90000 });
  await page.getByText("Reject all cookies").click().catch(() => {});
  await settle(page, 2500);
  const overflow = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  console.log(name, "overflow", JSON.stringify(overflow));
  await page.screenshot({ path: `/tmp/connect-eval-drive-haiku/shots/30-${name}-drive.png` });
  if (name.startsWith("phone") ) {
    const { context: c2, page: p2 } = { context, page };
  }
  console.log(name, "errors", JSON.stringify(errors.slice(0, 2)));
  await context.close();
}
