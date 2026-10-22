import { chromium } from "/home/user/powerhouse/test/package-e2e/node_modules/@playwright/test/index.mjs";
export const BASE = "http://localhost:2809";
export async function open(viewport = { width: 1280, height: 800 }, scheme = "light") {
  const context = await chromium.launchPersistentContext("/tmp/connect-eval-drive-haiku/profile", {
    executablePath: "/opt/pw-browsers/chromium", viewport, colorScheme: scheme, headless: true,
  });
  const page = context.pages()[0] ?? (await context.newPage());
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message.slice(0, 300)));
  page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text().slice(0, 300)); });
  return { context, page, errors };
}
export async function settle(page, ms = 1500) { await page.waitForLoadState("networkidle").catch(() => {}); await page.waitForTimeout(ms); }
