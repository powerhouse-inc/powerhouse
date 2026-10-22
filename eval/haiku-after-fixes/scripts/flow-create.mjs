import { chromium } from "/home/user/powerhouse/test/package-e2e/node_modules/@playwright/test/index.mjs";
const BASE = "http://localhost:2867";
const log = (...a) => console.log(...a);
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
const errs = [];
page.on("pageerror", (e) => errs.push("PAGEERROR " + e.message.slice(0, 160)));
page.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 160)); });
await page.goto(BASE + "/inventory", { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(12000);
const rej = page.getByRole("button", { name: "Reject all cookies" });
if (await rej.isVisible().catch(() => false)) { await rej.click(); await page.waitForTimeout(600); }
await page.waitForSelector("table tbody tr", { timeout: 60000 });

// B: create through the modal
await page.getByRole("link", { name: "New inventory item" }).click();
await page.getByPlaceholder("Document name").fill("Spacer Ring");
const sel = page.locator("select").first();
const opts = await sel.locator("option").allInnerTexts();
log("drive options:", JSON.stringify(opts));
await sel.selectOption({ index: 2 });
await page.waitForTimeout(500);
await page.getByRole("button", { name: "Create", exact: true }).click();
await page.waitForTimeout(5000);
log("B2 url after create:", page.url());
await page.screenshot({ path: "/tmp/connect-eval4/shots/06-created-via-modal.png" });
log("B2 text:", (await page.innerText("body")).replace(/\s+/g, " ").slice(0, 300));

// C: add an item in the editor
await page.getByRole("link", { name: "Spacer Ring" }).first().click();
await page.getByRole("button", { name: "Add item" }).waitFor({ timeout: 40000 }).catch(() => log("no add button"));
await page.waitForTimeout(4000);
log("C0 url:", page.url());
const name = page.getByRole("textbox", { name: "Name" });
if (await name.count()) {
  await name.fill("Spacer Ring");
  await page.getByRole("spinbutton", { name: "Quantity" }).fill("5");
  await page.getByRole("textbox", { name: "Location" }).fill("Bin 9");
  await page.getByRole("button", { name: "Add item" }).click();
  await page.waitForTimeout(3000);
  log("C text:", (await page.innerText("body")).replace(/\s+/g, " ").slice(0, 300));
} else {
  log("C: add form not found; body:", (await page.innerText("body")).replace(/\s+/g, " ").slice(0, 300));
}
await page.screenshot({ path: "/tmp/connect-eval4/shots/07-editor-after-add.png" });

// D: rejected adjustment
const adjust = page.getByRole("spinbutton").first();
await adjust.fill("-10");
await page.getByRole("button", { name: "Adjust", exact: true }).click();
await page.waitForTimeout(3000);
log("D banner:", await page.getByRole("alert").innerText().catch(() => "NO ALERT"));
await page.screenshot({ path: "/tmp/connect-eval4/shots/08-editor-rejected.png" });

// E: valid adjustment and move
await adjust.fill("3");
await page.getByRole("button", { name: "Adjust", exact: true }).click();
await page.waitForTimeout(2000);
await page.getByRole("textbox", { name: "Move to" }).fill("Rack Z");
await page.getByRole("button", { name: "Move", exact: true }).click();
await page.waitForTimeout(3000);
log("E text:", (await page.innerText("body")).replace(/\s+/g, " ").slice(0, 300));
await page.screenshot({ path: "/tmp/connect-eval4/shots/09-editor-adjusted-moved.png" });
log("errors:", errs.slice(0, 6).join(" | "));
await browser.close();
