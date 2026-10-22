// Runs a scenario module against a persistent Chromium profile.
// Usage: node drive.mjs <scenario.mjs> [args...]
// Env: BASE (default http://localhost:2082), W/H viewport, THEME=dark, PROFILE dir
import { chromium } from "/home/user/powerhouse/test/package-e2e/node_modules/@playwright/test/index.mjs";
import path from "node:path";
const [scenario, ...args] = process.argv.slice(2);
const profile = process.env.PROFILE ?? "/tmp/connect-eval-drive-opus/profile";
const ctx = await chromium.launchPersistentContext(profile, {
  executablePath: "/opt/pw-browsers/chromium",
  viewport: { width: +(process.env.W ?? 1280), height: +(process.env.H ?? 800) },
  colorScheme: process.env.THEME === "dark" ? "dark" : "light",
});
const page = ctx.pages()[0] ?? (await ctx.newPage());
const logs = [];
page.on("console", (m) => {
  if (m.type() === "error") logs.push(`console.error: ${m.text().slice(0, 400)}`);
});
page.on("pageerror", (e) => logs.push(`pageerror: ${e.message.slice(0, 400)}`));
let navs = 0;
page.on("framenavigated", (f) => { if (f === page.mainFrame()) navs++; });
const BASE = process.env.BASE ?? "http://localhost:2082";
const shot = async (name) => {
  await page.screenshot({ path: `/tmp/connect-eval-drive-opus/shots/${name}.png` });
  console.log("shot:", name);
};
const text = async (sel = "body", n = 800) =>
  (await page.locator(sel).first().innerText()).replace(/\n+/g, " | ").slice(0, n);
// Marker that survives client-side navigation but not a full reload.
const mark = () => page.evaluate(() => { window.__noReload = 1; });
const stillSamePage = () => page.evaluate(() => window.__noReload === 1);
const dismissCookies = async () => {
  const b = page.getByRole("button", { name: "Reject all cookies" });
  if (await b.isVisible().catch(() => false)) await b.click();
};
try {
  const mod = await import(path.resolve(scenario));
  await mod.default({ page, ctx, BASE, shot, text, mark, stillSamePage, dismissCookies, args, logs, navs: () => navs });
} catch (e) {
  console.log("SCENARIO ERROR:", e.message.split("\n").slice(0, 6).join("\n"));
  await page.screenshot({ path: `/tmp/connect-eval-drive-opus/shots/error-${path.basename(scenario, ".mjs")}.png` }).catch(() => {});
  process.exitCode = 1;
} finally {
  if (logs.length) console.log("--- browser errors (" + logs.length + ")\n" + [...new Set(logs)].slice(0, 12).join("\n"));
  await ctx.close();
}
