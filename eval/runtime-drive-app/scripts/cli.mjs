import { chromium } from "/home/user/powerhouse/test/package-e2e/node_modules/@playwright/test/index.mjs";
const BASE = "http://localhost:6607";
const gql = async (q) => (await (await fetch("http://localhost:7607/graphql", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query: q }) })).json());
const driveNodes = async () => { const d = (await gql(`{ document(idOrSlug:"powerhouse") { document { state } } }`)).data.document.document; return ((d.state.global ?? d.state).nodes ?? []).map((n) => n.name); };
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
const page = await ctx.newPage();
const errs = [];
page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errs.push(m.text().slice(0, 200)); });
await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
const rj = page.getByRole("button", { name: "Reject all cookies" });
await rj.waitFor({ timeout: 30000 }).then(() => rj.click()).catch(() => {});
await page.waitForTimeout(8000);
console.log("drive links:", await page.locator('a[href^="/d/"]').evaluateAll((as) => [...new Set(as.map((a) => a.getAttribute("href")))]));
await page.locator('a[href="/stockroom"]').first().click(); await page.waitForTimeout(3000);
console.log("/stockroom:", (await page.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 160));
await page.locator("li, tr, div").filter({ hasText: /^flagged-app/ }).filter({ has: page.getByRole("button", { name: "Use Stockroom app" }) }).last().getByRole("button", { name: "Use Stockroom app" }).click().catch((e) => console.log("no button", e.message.slice(0, 60)));
await page.waitForTimeout(3000);
console.log("switchboard meta:", JSON.stringify((await gql(`{ document(idOrSlug:"powerhouse") { document { meta } } } `)).data.document.document.meta));
await page.goto(BASE + "/d/powerhouse"); 
const ok = await page.getByText("+ New inventory item").waitFor({ timeout: 30000 }).then(() => true).catch(() => false);
console.log("drive opens in the package's app:", ok);
await page.screenshot({ path: "/tmp/connect-eval6/shots/cli-drive.png" });
if (ok) {
  await page.getByText("+ New inventory item").click();
  await page.getByPlaceholder("Document name").fill("CLI crate"); await page.getByRole("button", { name: "Create" }).click();
  await page.waitForTimeout(4000);
  console.log("after create:", page.url().replace(BASE, ""));
  await page.screenshot({ path: "/tmp/connect-eval6/shots/cli-item.png" });
}
for (let i = 0; i < 8; i++) { const n = await driveNodes(); if (n.includes("CLI crate") || i === 7) { console.log("switchboard drive nodes:", JSON.stringify(n)); break; } await page.waitForTimeout(2000); }
console.log("errors:", JSON.stringify([...new Set(errs)]).slice(0, 600));
await browser.close();
