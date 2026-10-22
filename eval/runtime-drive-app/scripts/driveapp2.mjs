import { chromium } from "/home/user/powerhouse/test/package-e2e/node_modules/@playwright/test/index.mjs";
const BASE = process.env.BASE ?? "http://localhost:6607";
const tag = process.env.TAG ?? "dev";
const shot = (p, n) => p.screenshot({ path: `/tmp/connect-eval6/shots/${tag}-${n}.png` });
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
const page = await ctx.newPage();
async function ensureDrive() {
  if (await page.locator('a[href^="/d/runtime-stockroom"]').count()) return;
  await page.getByText("Create New Drive").first().click();
  await page.waitForTimeout(1500);
  const dlg = page.locator('[role="dialog"]').first();
  await dlg.getByRole("textbox").first().fill("Runtime Stockroom");
  await dlg.getByRole("button", { name: /create/i }).last().click();
  await page.waitForTimeout(4000);
}
const errs = [];
page.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errs.push(m.text().slice(0, 200)); });
await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
const rj = page.getByRole("button", { name: "Reject all cookies" });
await rj.waitFor({ timeout: 30000 }).then(() => rj.click()).catch(() => {});
await page.waitForTimeout(6000);
await ensureDrive();
await page.locator('a[href^="/d/runtime-stockroom"]').first().click();
await page.getByText("+ New inventory item").waitFor({ timeout: 30000 });
await page.evaluate(() => { window.__m = 1; });
// add a folder
const folderInput = page.getByPlaceholder(/folder/i).first();
if (await folderInput.count()) { await folderInput.fill("Shelf A"); await folderInput.press("Enter"); }
else { await page.getByText("Add folder").first().click(); await page.waitForTimeout(500); await page.getByRole("textbox").last().fill("Shelf A"); await page.keyboard.press("Enter"); }
await page.waitForTimeout(2000);
console.log("folder created:", await page.getByText("Shelf A").count() > 0);
// new item at root through the modal
await page.getByText("+ New inventory item").click();
const name = page.getByPlaceholder("Document name");
await name.waitFor({ timeout: 15000 });
await name.fill("Hex bolts");
await page.getByRole("button", { name: "Create" }).click();
await page.waitForTimeout(4000);
console.log("after create url:", page.url().replace(BASE, ""), "| no reload:", await page.evaluate(() => window.__m === 1));
await shot(page, "04-item-open");
const editorText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
console.log("editor shown:", /quantity|register|adjust/i.test(editorText), "|", editorText.slice(0, 160));
// back to the drive view
await page.goBack(); await page.waitForTimeout(2500);
console.log("back url:", page.url().replace(BASE, ""));
const rows = await page.locator("tbody tr").allInnerTexts();
console.log("rows:", rows.map((r) => r.replace(/\s+/g, " ")).join(" | "));
// move the item to Shelf A via row select, if present
const sel = page.locator("tbody tr select").first();
if (await sel.count()) {
  const opts = await sel.locator("option").allInnerTexts();
  const target = opts.find((o) => /Shelf A/.test(o));
  if (target) { await sel.selectOption({ label: target }); await page.waitForTimeout(2500); }
  console.log("moved; root rows now:", (await page.locator("tbody tr").allInnerTexts()).length);
  await page.getByText("Shelf A").first().click(); await page.waitForTimeout(2000);
  console.log("Shelf A rows:", (await page.locator("tbody tr").allInnerTexts()).map((r) => r.replace(/\s+/g, " ")).join(" | "));
}
await shot(page, "05-folder");
console.log("errors:", JSON.stringify([...new Set(errs)]));
await browser.close();
