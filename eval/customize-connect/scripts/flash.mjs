import { open, shot, BASE } from "./lib.mjs";
for (let run = 0; run < 3; run++) {
  const { browser, page } = await open();
  await page.goto(BASE + "/", { waitUntil: "commit" });
  const seen = [];
  const t0 = Date.now();
  while (Date.now() - t0 < 12000) {
    const s = await page.evaluate(() => {
      const card = !!document.querySelector('[data-testid="inventory-card"]');
      const create = document.body?.innerText.includes("Create New Drive");
      const loading = document.body?.innerText.includes("Loading inventory");
      const drives = document.querySelectorAll('a[href^="/d/"]').length;
      return `card=${card} createDrive=${create} loading=${loading} drives=${drives}`;
    }).catch(() => "nav");
    if (seen.at(-1)?.s !== s) { seen.push({ t: Date.now() - t0, s }); if (s.includes("card=false createDrive=true")) await shot(page, `09-flash-${run}`); }
    await page.waitForTimeout(30);
  }
  console.log(`run ${run}:\n  ` + seen.map((x) => `+${x.t}ms ${x.s}`).join("\n  "));
  await browser.close();
}
