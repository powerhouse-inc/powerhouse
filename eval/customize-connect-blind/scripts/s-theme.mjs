import { boot } from "./common.mjs";
export default async (page, { shot }) => {
  const s = process.env.SCHEME || "light";
  await boot(page, "/inventory", /Every inventory item/);
  await page.waitForTimeout(2000);
  const info = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    const icon = [...document.querySelectorAll('link[rel~="icon"]')].map((l) => l.getAttribute("href") + " " + (l.getAttribute("type") || ""));
    return { dark: document.documentElement.classList.contains("dark"), primary: cs.getPropertyValue("--primary").trim(), bg: cs.getPropertyValue("--background").trim(), brand: cs.getPropertyValue("--color-brand-700").trim(), title: document.title, icon };
  });
  console.log(s, JSON.stringify(info));
  const btn = page.getByRole("link", { name: "Vetra Preview" }).last();
  console.log("button bg:", await btn.evaluate((e) => getComputedStyle(e).backgroundColor));
  await shot(`30-inventory-${s}`);
  for (const ic of info.icon) { const u = ic.split(" ")[0]; const r = await page.request.get(new URL(u, page.url()).href); console.log("icon", u, r.status(), r.headers()["content-type"], (await r.text()).slice(0, 40)); }
};
