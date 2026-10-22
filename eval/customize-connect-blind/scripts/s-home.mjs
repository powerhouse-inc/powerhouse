export default async (page, { shot }) => {
  const t0 = Date.now();
  await page.goto("http://localhost:2987/");
  await page.getByText(/Vetra/).first().waitFor({ timeout: 90000 }).catch(() => console.log("no drive text"));
  console.log("loaded in", Date.now() - t0, "ms");
  await page.waitForTimeout(1500);
  await shot("01-studio-home");
  console.log((await page.locator("body").innerText()).slice(0, 800));
};
