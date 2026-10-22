import { open, dismissCookies, BASE } from "./lib.mjs";
const { browser, page } = await open();
await page.goto(BASE + "/stock-report", { waitUntil: "domcontentloaded" });
await page.getByRole("heading", { name: "Stock report" }).waitFor({ timeout: 60000 });
await page.waitForTimeout(3000);
console.log(JSON.stringify(await page.evaluate(() => {
  const h1 = document.querySelector("h1.text-3xl");
  const adopted = document.adoptedStyleSheets.map((s) => `${s.cssRules.length} rules, first: ${s.cssRules[0]?.cssText.slice(0, 80)}`);
  const all = [...document.querySelectorAll("link,style")].map((e) => `${e.tagName} ${e.getAttribute("href") ?? ""} ${e.getAttribute("rel") ?? ""} ${e.textContent?.length ?? 0}`);
  const has3xl = [...document.styleSheets].some((s) => { try { return [...s.cssRules].some(function walk(r) { return (r.selectorText ?? "").includes("text-3xl") || [...(r.cssRules ?? [])].some(walk); }); } catch { return false; } });
  return { h1Class: h1?.className, h1FontSize: h1 && getComputedStyle(h1).fontSize, adopted, all, sheetCount: document.styleSheets.length, has3xlInSheets: has3xl };
}), null, 1));
await browser.close();
