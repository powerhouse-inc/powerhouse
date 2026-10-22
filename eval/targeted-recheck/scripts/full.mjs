import { open, shot, dismissCookies, BASE } from "./lib.mjs";
const SB = "http://localhost:4415/graphql";
const gql = async (query) => (await (await fetch(SB, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query }) })).json()).data;
const scheme = process.argv[2] ?? "light";
const { browser, page, logs } = await open({ colorScheme: scheme });
const S = (n) => shot(page, `${scheme}-${n}`);
await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
await dismissCookies(page);
for (let i = 0; i < 40 && !(await page.locator('a[href="/inventory"]').count()); i++) await page.waitForTimeout(1000);
await page.waitForTimeout(1500);
await S("01-home");
console.log(`[${scheme}] home: eval's home card shipped? ${await page.getByTestId("inventory-card").count() > 0}; eval's _app "Stock report" item shipped? ${await page.locator('a[href="/stock-report"]').count() > 0}; html.dark=${await page.evaluate(() => document.documentElement.classList.contains("dark"))}`);
// package CSS: how it is attached, its layer, and token values
console.log(`[${scheme}] css:`, JSON.stringify(await page.evaluate(() => {
  const sheets = [...document.styleSheets, ...document.adoptedStyleSheets];
  const pkg = sheets.filter((s) => { try { return [...s.cssRules].some((r) => r.cssText.includes("external-packages")) && (s.href ?? "").includes("stock-app") || [...s.cssRules].some((r) => r.cssText.startsWith("@layer external-packages{") || r.cssText.startsWith("@layer external-packages {")); } catch { return false; } });
  const links = [...document.querySelectorAll('link[rel="stylesheet"],style')].map((e) => e.getAttribute("href") ?? `<style ${[...e.attributes].map((a) => a.name + "=" + a.value).join(" ")}> ${e.textContent.length}b`);
  const cs = getComputedStyle(document.documentElement);
  return { pkgSheets: pkg.map((s) => s.href ?? "inline/adopted"), elements: links, primary: cs.getPropertyValue("--primary").trim(), card: cs.getPropertyValue("--card").trim() };
})));
// sidebar nav -> inventory page
await page.evaluate(() => { window.__m = 1; });
await page.locator('a[href="/inventory"]').first().click();
await page.getByRole("heading", { name: "Inventory" }).waitFor({ timeout: 30000 });
await page.waitForTimeout(3000);
console.log(`[${scheme}] /inventory: no reload=${await page.evaluate(() => window.__m === 1)} title="${await page.title()}" shown="${await page.getByTestId("shown-count").innerText().catch(() => "n/a")}"`);
console.log(`[${scheme}] rows:`, (await page.locator("table tbody tr").allInnerTexts()).map((t) => t.replace(/\s+/g, " ")).join(" | "));
await S("02-inventory");
// open an item -> package editor
const link = page.getByRole("link", { name: "Hex bolts" }).first();
console.log(`[${scheme}] Hex bolts link:`, await link.getAttribute("href").catch(() => "none"));
await link.click();
await page.getByTestId("quantity").waitFor({ timeout: 30000 });
await page.waitForTimeout(1500);
await S("03-editor");
const styleOf = async (sel) => page.locator(sel).first().evaluate((el) => { const c = getComputedStyle(el); return `bg=${c.backgroundColor} fg=${c.color} border=${c.borderColor} radius=${c.borderRadius} pad=${c.padding}`; }).catch((e) => "n/a " + e.message.slice(0, 60));
console.log(`[${scheme}] editor card (.bg-card):`, await styleOf(".bg-card"));
console.log(`[${scheme}] editor button (.bg-primary):`, await styleOf("button.bg-primary"));
console.log(`[${scheme}] editor input (.border-input):`, await styleOf("input.border-input"));
console.log(`[${scheme}] qty before:`, await page.getByTestId("quantity").innerText());
if (scheme === "light") {
  // use the editor: adjust quantity through its form, then read the switchboard
  const form = page.locator("form").filter({ hasText: /adjust/i }).first();
  await form.locator('input[type="number"]').first().fill("-20");
  await form.locator("button").first().click();
  await page.waitForTimeout(4000);
  console.log(`[${scheme}] qty after -20:`, await page.getByTestId("quantity").innerText());
}
await page.goto(BASE + "/stock-report", { waitUntil: "domcontentloaded" });
await page.getByRole("heading", { name: "Stock report" }).waitFor({ timeout: 60000 }).catch(() => console.log("no stock report heading"));
await page.waitForTimeout(4000);
await S("04-stock-report");
console.log(`[${scheme}] stock-report text:`, (await page.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 200));
await page.goto(BASE + "/settings/inventory", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(6000);
await S("05-settings");
console.log(`[${scheme}] settings tabs:`, (await page.locator('a[href^="/settings/"]').allInnerTexts()).map((t) => t.trim()).filter(Boolean).join(", "));
const sb = await gql(`{ findDocuments(search:{type:"stock-app/inventory-item"}) { items { name state } } }`);
console.log(`[${scheme}] switchboard:`, sb.findDocuments.items.map((i) => `${i.name}=${(i.state.global ?? i.state).quantity}`).join(", "));
console.log("LOGS:\n" + logs.slice(0, 15).join("\n"));
await browser.close();
