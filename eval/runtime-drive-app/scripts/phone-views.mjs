import { chromium } from "/home/user/powerhouse/test/package-e2e/node_modules/@playwright/test/index.mjs";
const BASE = "http://localhost:6607";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
for (const [tag, vp, scheme, mobile] of [["light", { width: 1280, height: 860 }, "light", false], ["dark", { width: 1280, height: 860 }, "dark", false], ["phone", { width: 390, height: 844 }, "light", true]]) {
  const ctx = await browser.newContext({ viewport: vp, colorScheme: scheme, isMobile: mobile, hasTouch: mobile });
  const page = await ctx.newPage();
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  const rj = page.getByRole("button", { name: "Reject all cookies" });
  await rj.waitFor({ timeout: 30000 }).then(() => rj.click()).catch(() => {});
  await page.waitForTimeout(5000);
  // a drive with the package's app and one item, created through the UI
  await page.getByText("Create New Drive").first().click(); await page.waitForTimeout(1200);
  const dlg = page.locator('[role="dialog"]').first();
  await dlg.getByRole("textbox").first().fill(`Stock ${tag}`); await dlg.getByRole("button", { name: /create/i }).last().click();
  await page.waitForTimeout(3500);
  await page.locator(`a[href^="/d/stock-${tag}"]`).first().click();
  await page.getByText("+ New inventory item").waitFor({ timeout: 30000 });
  await page.getByText("+ New inventory item").click();
  await page.getByPlaceholder("Document name").fill("Wing nuts"); await page.getByRole("button", { name: "Create" }).click();
  await page.waitForTimeout(3500);
  await page.screenshot({ path: `/tmp/connect-eval6/shots/views-${tag}-editor.png` });
  await page.goBack(); await page.waitForTimeout(2500);
  const m = await page.evaluate(() => {
    const nav = document.querySelector("[data-connect-sidebar]") ?? document.querySelector("nav, aside");
    const r = nav?.getBoundingClientRect();
    const t = [...document.querySelectorAll("*")].find((e) => e.children.length === 0 && /\+ New inventory item/.test(e.textContent ?? ""));
    const tr = t?.getBoundingClientRect();
    return { html: document.documentElement.className, nav: r && `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}`, newItemBtn: tr && `@${Math.round(tr.x)},${Math.round(tr.y)}`, scrollW: document.documentElement.scrollWidth };
  });
  console.log(tag, JSON.stringify(m));
  await page.screenshot({ path: `/tmp/connect-eval6/shots/views-${tag}-drive.png` });
  await ctx.close();
}
await browser.close();
