import { boot } from "./common.mjs";
export default async (page) => {
  await boot(page, "/", /Vetra Preview/);
  const h = await page.getByText("Vetra Preview").first().evaluate((el) => { let e = el; for (let i=0;i<3;i++) e = e.parentElement; return e.outerHTML.replace(/<svg[\s\S]*?<\/svg>/g, "<svg/>").slice(0, 900); });
  console.log(h);
};
