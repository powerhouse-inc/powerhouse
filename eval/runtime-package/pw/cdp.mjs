import { open, BASE } from "./lib.mjs";
const { browser, page, context } = await open();
await page.goto(BASE + "/stock-report", { waitUntil: "domcontentloaded" });
await page.getByRole("heading", { name: "Stock report" }).waitFor({ timeout: 60000 });
await page.waitForTimeout(3000);
const cdp = await context.newCDPSession(page);
const sheets = [];
cdp.on("CSS.styleSheetAdded", (e) => sheets.push(e.header));
await cdp.send("DOM.enable"); await cdp.send("CSS.enable");
await cdp.send("CSS.enable").catch(() => {});
const { root } = await cdp.send("DOM.getDocument", { depth: -1 });
for (const sel of ["h1.text-3xl", "input.border-input", ".text-card-foreground"]) {
  const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: root.nodeId, selector: sel });
  if (!nodeId) { console.log(sel, "no node"); continue; }
  const m = await cdp.send("CSS.getMatchedStylesForNode", { nodeId });
  const hits = m.matchedCSSRules.map((r) => `${r.rule.selectorList.text} [${r.rule.origin}] ${r.rule.styleSheetId ?? ""} {${r.rule.style.cssProperties.filter((p) => p.value && !p.disabled).map((p) => p.name + ":" + p.value).slice(0, 3).join(";")}}`).filter((t) => /3xl|input|card-foreground|h1/.test(t));
  console.log(sel, "=>\n  " + hits.join("\n  "));
}
await page.waitForTimeout(500);
for (const h of sheets) { const t = (await cdp.send("CSS.getStyleSheetText", { styleSheetId: h.styleSheetId })).text; h.length = t.length; h.head = t.slice(0, 90).replace(/\s+/g, " "); }
const byId = Object.fromEntries(sheets.map((h) => [h.styleSheetId, `${h.sourceURL || "(no url)"} ${h.origin} constructed=${h.isConstructed} len=${h.length} ownerNode=${h.ownerNode} id=${h.styleSheetId} head=${h.head}`]));
console.log("sheets:\n  " + Object.values(byId).join("\n  "));
await browser.close();
