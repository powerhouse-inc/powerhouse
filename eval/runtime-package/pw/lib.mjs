import { chromium } from "/home/user/powerhouse/test/package-e2e/node_modules/@playwright/test/index.mjs";
export const BASE = process.env.BASE ?? "http://localhost:3415";
export async function open({ colorScheme = "light", width = 1280, height = 860 } = {}) {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const context = await browser.newContext({ viewport: { width, height }, colorScheme });
  const page = await context.newPage();
  const logs = [];
  page.on("console", (m) => { if (["error", "warning"].includes(m.type())) logs.push(`[${m.type()}] ${m.text().slice(0, 300)}`); });
  page.on("pageerror", (e) => logs.push(`[pageerror] ${String(e).slice(0, 300)}`));
  const requests = [];
  page.on("response", (r) => { const u = r.url(); if (/stock-app|localhost:8080/.test(u)) requests.push(`${r.status()} ${u}`); });
  return { browser, context, page, logs, requests };
}
export const shot = (page, name) => page.screenshot({ path: `/tmp/connect-eval3/shots/${name}.png` });
export async function dismissCookies(page) {
  const b = page.getByRole("button", { name: "Reject all cookies" });
  await b.waitFor({ timeout: 15000 }).then(() => b.click()).catch(() => {});
}
