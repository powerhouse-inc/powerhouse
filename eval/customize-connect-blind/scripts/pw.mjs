// Usage: node pw.mjs <script.mjs>  -- script default-exports async (page, ctx) => {}
import { chromium } from "/home/user/powerhouse/test/package-e2e/node_modules/@playwright/test/index.mjs";
const mod = await import(process.argv[2]);
const profile = process.env.PROFILE || "/tmp/connect-eval2/scripts/profile";
const context = await chromium.launchPersistentContext(profile, {
  executablePath: "/opt/pw-browsers/chromium",
  viewport: { width: Number(process.env.W || 1400), height: Number(process.env.H || 900) },
  colorScheme: process.env.SCHEME || "light",
});
const page = context.pages()[0] ?? (await context.newPage());
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text().slice(0, 300)); });
try { await mod.default(page, { context, shot: (n) => page.screenshot({ path: `/tmp/connect-eval2/shots/${n}.png` }) }); }
catch (e) { console.log("SCRIPT ERROR:", e.message.split("\n").slice(0, 6).join("\n")); }
finally {
  const uniq = [...new Set(errors)];
  if (uniq.length) console.log("BROWSER ERRORS (" + uniq.length + "):\n" + uniq.slice(0, 15).join("\n"));
  await context.close();
}
