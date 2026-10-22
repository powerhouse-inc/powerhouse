import { chromium } from "/home/user/powerhouse/test/package-e2e/node_modules/@playwright/test/index.mjs";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: false });
const page = await ctx.newPage();
for (const path of ["/inventory"]) {
  await page.goto("http://localhost:2867" + path, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(12000);
  const rej = page.getByRole("button", { name: "Reject all cookies" });
  if (await rej.isVisible().catch(() => false)) { await rej.click(); await page.waitForTimeout(800); }
  const info = await page.evaluate(() => {
    const nav = document.querySelector("nav"); const r = nav?.getBoundingClientRect();
    const h = [...document.querySelectorAll("h1,h2")].slice(0, 2).map((e) => { const b = e.getBoundingClientRect(); return `${e.textContent.slice(0,20)}@${Math.round(b.x)},${Math.round(b.y)}`; });
    return { nav: r && `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}`, heads: h, sw: document.documentElement.scrollWidth, bodyOverflow: getComputedStyle(document.body).overflow };
  });
  console.log(path, JSON.stringify(info));
  await page.screenshot({ path: "/tmp/connect-eval4/shots/20-phone" + path.replace(/\//g, "-") + ".png" });
}
await browser.close();
