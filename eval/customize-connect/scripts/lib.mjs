import { chromium } from "/home/user/powerhouse/test/package-e2e/node_modules/@playwright/test/index.mjs";
export const BASE = process.env.BASE ?? "http://localhost:2189";
export async function open(opts = {}) {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 }, colorScheme: opts.colorScheme ?? "light" });
  const page = await context.newPage();
  const logs = [];
  page.on("console", (m) => { if (["error", "warning"].includes(m.type())) logs.push(`[${m.type()}] ${m.text().slice(0, 300)}`); });
  page.on("pageerror", (e) => logs.push(`[pageerror] ${String(e).slice(0, 300)}`));
  return { browser, context, page, logs };
}
export const shot = (page, name) => page.screenshot({ path: `/tmp/connect-eval/shots/${name}.png` });
