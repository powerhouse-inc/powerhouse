import { open, BASE } from "./lib.mjs";
const { browser, page } = await open();
const bad = [];
page.on("response", (r) => { if (r.status() >= 400) bad.push(`${r.status()} ${r.url()}`); });
page.on("requestfailed", (r) => bad.push(`FAILED ${r.failure()?.errorText} ${r.url()}`));
await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(12000);
console.log(bad.join("\n"));
await browser.close();
