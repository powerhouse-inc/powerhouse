import { open, shot, BASE } from "./lib.mjs";
for (let run = 0; run < 4; run++) {
  const { browser, page, logs } = await open();
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await page.getByTestId("inventory-card").waitFor({ timeout: 90000 });
  const seen = [];
  const t0 = Date.now();
  while (Date.now() - t0 < 6000) {
    const c = await page.getByTestId("inventory-card").count();
    const d = await page.locator('a[href^="/d/"]').count();
    const txt = c ? "" : (await page.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 80);
    const s = `card=${c} drives=${d} ${txt}`;
    if (seen.at(-1)?.s !== s) seen.push({ t: Date.now() - t0, s });
    if (run === 0 && c === 0) await shot(page, "07-card-gone");
    await page.waitForTimeout(100);
  }
  console.log(`run ${run}:`, seen.map((x) => `+${x.t}ms ${x.s}`).join(" || "));
  if (logs.length) console.log(logs.join("\n"));
  await browser.close();
}
