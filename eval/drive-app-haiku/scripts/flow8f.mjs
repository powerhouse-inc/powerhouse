import { open, BASE, settle } from "./pwlib.mjs";
const { context, page, errors } = await open();
const IDS = { pref: "JHOXJOdvW1k1VQCK_nisJxgmpi0HK6P7GK8O6-idyjo", existing: "NqfhsKuJ5H6Uouw_jyHOEtWqxcECjS5dFXatnb-VtF4" };
for (const [k, id] of Object.entries(IDS)) {
  await page.goto(BASE + "/", { waitUntil: "networkidle", timeout: 90000 });
  await page.getByText("Reject all cookies").click().catch(() => {});
  await settle(page, 600);
  await page.getByText("Create New Drive").click();
  await settle(page, 500);
  await page.getByText("Add Drive", { exact: true }).first().click();
  await settle(page, 300);
  await page.getByPlaceholder("Drive URL").fill(`http://localhost:7809/d/${id}`);
  await page.waitForTimeout(2500);
  await page.getByRole("button", { name: "Add drive" }).click();
  await page.waitForTimeout(1200);
  const submit = page.getByRole("button", { name: "Add new drive" });
  if (await submit.count()) {
    console.log(k, "dialog:", JSON.stringify((await page.locator("[role=dialog]").first().innerText()).slice(0, 200)));
    await submit.click();
    await settle(page, 4000);
  } else console.log(k, "no submit button; dialog:", JSON.stringify((await page.locator("[role=dialog]").first().innerText()).slice(0, 200)));
  console.log(k, "URL", page.url());
  console.log(k, "BODY", JSON.stringify((await page.locator("body").innerText()).slice(0, 200)));
}
console.log("ERRORS", JSON.stringify(errors.slice(0, 5)));
await context.close();
