import { chromium } from "/home/user/powerhouse/test/package-e2e/node_modules/@playwright/test/index.mjs";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto("http://localhost:2867/inventory", { waitUntil: "domcontentloaded", timeout: 60000 });
const rej = page.getByRole("button", { name: "Reject all cookies" });
await page.waitForTimeout(15000);
if (await rej.isVisible().catch(() => false)) { await rej.click(); console.log("clicked reject"); }
await page.waitForTimeout(1500);
const more = page.getByRole("button", { name: "Load more" });
console.log("count", await more.count(), "visible", await more.isVisible().catch(() => "n/a"));
console.log("rows", await page.locator("table tbody tr").count());
if (await more.count()) {
  const box = await more.boundingBox(); console.log("box", JSON.stringify(box));
  const hit = await page.evaluate(([x,y]) => { const e = document.elementFromPoint(x,y); return e ? e.tagName + " " + (e.className||"").toString().slice(0,80) + " " + (e.textContent||"").slice(0,40) : null; }, [box.x+box.width/2, box.y+box.height/2]);
  console.log("elementAt center:", hit);
  await more.click({ timeout: 8000 }).then(() => console.log("clicked more")).catch((e) => console.log("click fail", e.message.split("\n")[0]));
  await page.waitForTimeout(4000);
  console.log("rows after", await page.locator("table tbody tr").count());
}
await page.screenshot({ path: "/tmp/connect-eval4/shots/03b-inventory-paged.png", fullPage: true });
await browser.close();
