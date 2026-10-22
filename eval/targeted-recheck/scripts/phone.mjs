import { chromium } from "/home/user/powerhouse/test/package-e2e/node_modules/@playwright/test/index.mjs";
const tag = process.argv[2];
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
for (const path of ["/inventory", "/"]) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto("http://localhost:2867" + path, { waitUntil: "domcontentloaded" });
  const rj = page.getByRole("button", { name: "Reject all cookies" });
  await rj.waitFor({ timeout: 30000 }).then(() => rj.click()).catch(() => {});
  await page.waitForTimeout(6000);
  const info = await page.evaluate(() => {
    const nav = document.querySelector("nav, aside");
    const r = nav?.getBoundingClientRect();
    const h = document.querySelector("h1, h2");
    const hr = h?.getBoundingClientRect();
    const wrap = nav?.parentElement;
    return { nav: r && `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}`, heading: h && `${h.textContent?.slice(0, 30)} @${Math.round(hr.x)},${Math.round(hr.y)}`, wrapClass: wrap?.className?.slice(0, 160) };
  });
  console.log(tag, path, JSON.stringify(info));
  await page.screenshot({ path: `/tmp/connect-eval5/shots/phone-${tag}${path === "/" ? "-home" : "-inventory"}.png` });
  await ctx.close();
}
await browser.close();
