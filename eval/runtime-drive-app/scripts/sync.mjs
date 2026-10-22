import { chromium } from "/home/user/powerhouse/test/package-e2e/node_modules/@playwright/test/index.mjs";
const BASE = "http://localhost:6607";
const gql = async (q) => (await (await fetch("http://localhost:7607/graphql", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query: q }) })).json());
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 860 } })).newPage();
const errs = [];
page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errs.push(m.text().slice(0, 200)); });
await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
const rj = page.getByRole("button", { name: "Reject all cookies" });
await rj.waitFor({ timeout: 30000 }).then(() => rj.click()).catch(() => {});
await page.waitForTimeout(5000);
await page.getByText("Create New Drive").first().click(); await page.waitForTimeout(1200);
await page.getByRole("tab", { name: /add drive/i }).or(page.getByText("Add Drive", { exact: true })).first().click();
await page.waitForTimeout(800);
const dlg = page.locator('[role="dialog"]').first();
await dlg.getByRole("textbox").first().fill("http://localhost:7607/d/powerhouse");
await page.waitForTimeout(2000);
await dlg.getByRole("button", { name: /^add drive$/i }).click(); await page.waitForTimeout(2500);
await dlg.getByRole("button", { name: /add new drive/i }).click().catch((e) => console.log("no second step:", e.message.slice(0, 80)));
await page.waitForTimeout(5000);
console.log("drive links:", await page.locator('a[href^="/d/"]').evaluateAll((as) => [...new Set(as.map((a) => a.getAttribute("href")))]));
// switch it to the package's app with the package's own /stockroom page
await page.locator('a[href="/stockroom"]').first().click(); await page.waitForTimeout(3000);
console.log("/stockroom text:", (await page.locator("main, body").first().innerText()).replace(/\s+/g, " ").slice(0, 300));
const row = page.locator("li, tr, div").filter({ hasText: "flagged-app" }).filter({ has: page.getByRole("button", { name: "Use Stockroom app" }) }).last();
await row.getByRole("button", { name: "Use Stockroom app" }).click().catch((e) => console.log("no use-app button:", e.message.slice(0, 80)));
await page.waitForTimeout(3000);
const h = (await gql(`{ document(idOrSlug:"powerhouse") { document { meta } } }`));
console.log("switchboard drive meta:", JSON.stringify(h.data?.document?.document?.meta ?? h).slice(0, 200));
// open it and create an item through the drive app
await page.locator('a[href^="/d/"]').filter({ hasText: /flagged-app/ }).first().click().catch(async () => { await page.goto(BASE + "/d/powerhouse"); });
await page.getByText("+ New inventory item").waitFor({ timeout: 30000 });
await page.getByText("+ New inventory item").click();
await page.getByPlaceholder("Document name").fill("Synced pallet"); await page.getByRole("button", { name: "Create" }).click();
for (let i = 0; i < 15; i++) {
  await page.waitForTimeout(2000);
  const r = await gql(`{ findDocuments(search:{type:"stockroom/inventory-item"}) { items { name } } }`);
  const names = r.data.findDocuments.items.map((x) => x.name);
  if (names.includes("Synced pallet") || i === 14) { console.log("switchboard items:", JSON.stringify(names), "after", (i + 1) * 2, "s"); break; }
}
console.log("errors:", JSON.stringify([...new Set(errs)]));
await browser.close();
