import { boot } from "./common.mjs";
export default async (page, { shot }) => {
  await boot(page, "/", /Vetra Preview/);
  await page.getByText("Create New Drive").first().click();
  const dlg = page.getByRole("dialog");
  await dlg.getByText("Add Drive", { exact: true }).click();
  await dlg.locator("input").first().fill("http://localhost:7987/d/S4WKh1bauxXN4bO56eMweVSafnCJ4dW81Y6t1IOTzWE");
  await page.waitForTimeout(3000);
  page.on("console", (m) => console.log("CONSOLE", m.type(), m.text().slice(0, 250)));
  page.on("requestfailed", (r) => console.log("REQFAIL", r.url().slice(0, 120), r.failure()?.errorText));
  await dlg.getByRole("button", { name: "Add drive" }).click();
  for (let i = 0; i < 10; i++) {
    await page.waitForTimeout(1500);
    const t = (await dlg.innerText().catch(() => "(closed)")).replace(/\s+/g, " ").slice(0, 400);
    console.log(i, t);
    if (/Add new drive/.test(t)) { await dlg.getByRole("button", { name: "Add new drive" }).click(); }
    if (t === "(closed)") break;
  }
  await page.waitForTimeout(2000);
  console.log(page.url());
  await shot("12-home-3-drives");
};
