import { boot } from "./common.mjs";
export default async (page, { context }) => {
  await boot(page, "/", /Vetra Preview/);
  const reject = page.getByRole("button", { name: /Reject all cookies/ });
  await reject.waitFor({ timeout: 15000 }).then(() => reject.click()).catch(() => console.log("no banner"));
  await page.waitForTimeout(1000);
  await context.storageState({ path: "/tmp/connect-eval2/scripts/state.json" });
  console.log("banner visible after:", await reject.isVisible());
};
