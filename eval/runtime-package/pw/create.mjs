import { open, shot, dismissCookies, BASE } from "./lib.mjs";
const gql = async (query) => (await (await fetch("http://localhost:4415/graphql", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query }) })).json()).data;
const { browser, page, logs } = await open();
await page.goto(BASE + "/inventory", { waitUntil: "domcontentloaded" });
await dismissCookies(page);
await page.getByRole("heading", { name: "Inventory" }).waitFor({ timeout: 60000 });
const btn = page.locator('main a, a').filter({ hasText: /^Warehouse$/ }).filter({ has: page.locator(":scope:not([href^='/d/'][aria-label])") });
const hrefs = await page.locator("a").evaluateAll((as) => as.filter((a) => /modal=create-document/.test(a.getAttribute("href") ?? "")).map((a) => a.getAttribute("href")));
console.log("modal links:", hrefs);
await page.evaluate(() => { window.__m = 1; });
await page.locator(`a[href="${hrefs[0]}"]`).click();
const name = page.getByPlaceholder("Document name");
await name.waitFor({ timeout: 30000 });
await name.fill("Cable ties");
await page.getByRole("button", { name: "Create" }).click();
await page.waitForTimeout(4000);
console.log("after create:", page.url().replace(BASE, ""), "no reload:", await page.evaluate(() => window.__m === 1));
await shot(page, "light-06-new-item");
console.log("form text:", (await page.locator("form").first().innerText().catch(() => "none")).replace(/\s+/g, " ").slice(0, 200));
const f = page.locator("form").first();
const inputs = f.locator("input");
const n = await inputs.count();
for (let i = 0; i < n; i++) {
  const el = inputs.nth(i); const type = await el.getAttribute("type"); const lbl = (await el.evaluate((e) => e.closest("label")?.textContent ?? e.getAttribute("aria-label") ?? e.name ?? "")).trim();
  await el.fill(type === "number" ? "250" : /sku/i.test(lbl) ? "CBL" : /loc/i.test(lbl) ? "Aisle 3" : "Cable ties");
}
await f.locator("button").first().click();
await page.waitForTimeout(5000);
console.log("qty:", await page.getByTestId("quantity").innerText().catch(() => "n/a"));
await shot(page, "light-07-new-item-added");
for (let i = 0; i < 10; i++) {
  const d = await gql(`{ findDocuments(search:{type:"stock-app/inventory-item"}) { items { name state } } }`);
  const hit = d.findDocuments.items.find((x) => x.name === "Cable ties");
  if (hit && (hit.state.global ?? hit.state).quantity) { console.log("switchboard has:", JSON.stringify(hit.state.global ?? hit.state)); break; }
  if (i === 9) console.log("switchboard:", d.findDocuments.items.map((x) => `${x.name}=${JSON.stringify(x.state.global ?? x.state)}`).join(" | "));
  await page.waitForTimeout(2000);
}
console.log("LOGS:\n" + logs.slice(0, 10).join("\n"));
await browser.close();
