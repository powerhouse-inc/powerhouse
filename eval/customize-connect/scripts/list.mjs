import { open, shot, BASE } from "./lib.mjs";
const { browser, page, logs } = await open();
await page.goto(BASE + "/inventory", { waitUntil: "domcontentloaded" });
await page.getByTestId("inventory-page").waitFor({ timeout: 90000 });
const reject = page.getByRole("button", { name: "Reject all cookies" });
await reject.waitFor({ timeout: 15000 }).then(() => reject.click()).catch(() => {});
await page.waitForTimeout(3000);
const rows = () => page.getByTestId("inventory-row").count();
console.log("page1 rows:", await rows(), "|", await page.getByTestId("inventory-summary").innerText(), "| load-more:", await page.getByTestId("load-more").count());
await shot(page, "13-inventory-page1");
if (await page.getByTestId("load-more").count()) {
  await page.getByTestId("load-more").click();
  await page.waitForTimeout(3000);
  console.log("after load more rows:", await rows(), "|", await page.getByTestId("inventory-summary").innerText(), "| load-more:", await page.getByTestId("load-more").count());
}
await shot(page, "14-inventory-all");
// live update from the reactor while the page is open
const before = await page.getByTestId("inventory-summary").innerText();
await fetch("http://localhost:7189/graphql", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query: `mutation { InventoryItem { addStock(documentIdOrSlug:"_gWzEui5hoOZQj8X1Zwaa3rXaFWs4ozCX6UmTwN9He4", input:{id:"live1", amount: 1000, at:"${new Date().toISOString()}"}) { id } } }` }) }).then((r) => r.text()).then((t) => console.log("mutation:", t.slice(0, 120)));
let after = before;
for (let i = 0; i < 30 && after === before; i++) { await page.waitForTimeout(500); after = await page.getByTestId("inventory-summary").innerText(); }
console.log("live update:", before, "->", after);
// rows order
console.log("rows:", (await page.getByTestId("inventory-row").allInnerTexts()).map((t) => t.replace(/\s+/g, " ")).join(" | "));
console.log("LOGS:\n" + logs.join("\n"));
await browser.close();
