import { chromium } from "/home/user/powerhouse/test/package-e2e/node_modules/@playwright/test/index.mjs";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
page.on("console", (m) => { if (m.text().includes("DBG")) console.log("CONSOLE:", m.text().slice(0, 300)); });
await page.goto("http://localhost:2867/d/vetra-cea183c0/hinge-pin-azLH_6xnrXi644_UNxQNeSSyjwvqIRXp1JcZMa27n-I", { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(15000);
const rej = page.getByRole("button", { name: "Reject all cookies" });
if (await rej.isVisible().catch(() => false)) { await rej.click(); }
await page.waitForTimeout(1000);
await page.getByRole("spinbutton").first().fill("-100");
await page.getByRole("button", { name: "Adjust", exact: true }).click();
await page.waitForTimeout(4000);
console.log("alerts:", await page.getByRole("alert").count(), (await page.innerText("body")).replace(/\s+/g, " ").slice(0, 200));
await browser.close();
