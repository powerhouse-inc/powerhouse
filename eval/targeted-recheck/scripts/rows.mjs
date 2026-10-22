import { chromium } from "/home/user/powerhouse/test/package-e2e/node_modules/@playwright/test/index.mjs";
const gql = async (query) => (await (await fetch("http://localhost:7867/graphql", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query }) })).json());
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 1400 } })).newPage();
await page.goto("http://localhost:2867/inventory", { waitUntil: "domcontentloaded" });
const rj = page.getByRole("button", { name: "Reject all cookies" });
await rj.waitFor({ timeout: 30000 }).then(() => rj.click()).catch(() => {});
const rows = async () => (await page.locator("tbody tr").allInnerTexts()).map((t) => t.split("\t")[0].trim());
for (let i = 0; i < 30 && (await rows()).length < 10; i++) await page.waitForTimeout(500);
console.log("first page:", (await rows()).length);
for (let i = 0; i < 5; i++) {
  const more = page.getByRole("button", { name: "Load more" });
  if (!(await more.count())) break;
  await more.click(); await page.waitForTimeout(2000);
}
const before = await rows();
console.log("all loaded:", before.length, "load-more still shown:", await page.getByRole("button", { name: "Load more" }).count());
const r = await gql(`mutation { InventoryItem { createDocument(name:"Recheck Item", parentIdOrSlug:"preview-cea183c0") { id } } }`);
console.log("created:", JSON.stringify(r).slice(0, 120));
let after = before;
for (let i = 0; i < 20; i++) { await page.waitForTimeout(500); after = await rows(); if (after.length !== before.length) break; }
await page.waitForTimeout(2000); after = await rows();
const missing = before.filter((n, i) => after.filter((x) => x === n).length < before.filter((x) => x === n).length);
console.log("after create:", after.length, "| new present:", after.includes("Recheck Item"), "| rows dropped:", JSON.stringify([...new Set(missing)]), "| load-more shown:", await page.getByRole("button", { name: "Load more" }).count());
await page.screenshot({ path: "/tmp/connect-eval5/shots/rows-after-create.png", fullPage: true });
await browser.close();
