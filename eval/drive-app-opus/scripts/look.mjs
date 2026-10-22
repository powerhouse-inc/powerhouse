// Usage: node look.mjs <url> <shotname> [width height] [dark]
import { chromium } from "/home/user/powerhouse/test/package-e2e/node_modules/@playwright/test/index.mjs";
const [url, name, w = "1280", h = "800", theme] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({
  viewport: { width: +w, height: +h },
  colorScheme: theme === "dark" ? "dark" : "light",
});
const logs = [];
page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") logs.push(`${m.type()}: ${m.text().slice(0, 300)}`); });
page.on("pageerror", (e) => logs.push(`pageerror: ${e.message.slice(0, 300)}`));
await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });
await page.waitForTimeout(+(process.env.WAIT ?? 8000));
await page.screenshot({ path: `/tmp/connect-eval-drive-opus/shots/${name}.png` });
console.log("URL:", page.url());
console.log("TITLE:", await page.title());
const text = (await page.locator("body").innerText()).replace(/\n+/g, " | ").slice(0, 1200);
console.log("TEXT:", text);
console.log(logs.slice(0, 15).join("\n"));
await browser.close();
