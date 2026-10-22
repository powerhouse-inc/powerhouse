export const BASE = process.env.BASE || "http://localhost:2987";
export async function boot(page, path = "/", ready = /Vetra Preview|Create New Drive/) {
  await page.goto(BASE + path);
  await page.getByText(ready).first().waitFor({ timeout: 90000 });
  const reject = page.getByRole("button", { name: /Reject all cookies/ });
  if (await reject.isVisible().catch(() => false)) await reject.click();
  await page.waitForTimeout(500);
}
export const text = async (page, n = 1200) => (await page.locator("main, body").first().innerText()).slice(0, n);
