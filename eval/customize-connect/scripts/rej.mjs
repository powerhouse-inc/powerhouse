import { open, shot, BASE } from "./lib.mjs";
for (let run = 0; run < 4; run++) {
  const { browser, page, logs } = await open();
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await page.getByTestId("inventory-card").waitFor({ timeout: 90000 });
  await page.getByRole("button", { name: "Reject all cookies" }).click().catch((e) => console.log("no reject", e.message));
  const seen = [];
  const t0 = Date.now();
  while (Date.now() - t0 < 4000) {
    const c = await page.getByTestId("inventory-card").count();
    const d = await page.locator('a[href^="/d/"]').count();
    const s = `card=${c} drives=${d} url=${page.url().replace(BASE, "")}`;
    if (seen.at(-1)?.s !== s) { seen.push({ t: Date.now() - t0, s }); if (c === 0) await shot(page, `08-gone-${run}`); }
    await page.waitForTimeout(50);
  }
  console.log(`run ${run}:`, seen.map((x) => `+${x.t}ms ${x.s}`).join(" || "));
  if (logs.length) console.log(logs.join("\n"));
  await browser.close();
}
