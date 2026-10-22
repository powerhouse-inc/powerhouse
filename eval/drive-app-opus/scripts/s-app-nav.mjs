// args: driveSlug
// Row click opens in place, toolbar close, browser back/forward, move between folders, reload.
export default async ({ page, BASE, shot, text, dismissCookies, args, mark, stillSamePage }) => {
  const [slug, rootName = "Scaffold Test"] = args;
  await page.goto(`${BASE}/d/${slug}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(6000);
  await dismissCookies();
  await mark();
  const tree = (n) => page.getByRole("treeitem", { name: new RegExp(n) });
  await tree("Shelf A").click();
  await page.waitForTimeout(1000);
  const shelfA = page.url();
  // click a row (not the link) -> opens editor
  await page.locator('[data-testid="item-row"]', { hasText: "Nuts" }).locator("td").nth(1).click();
  await page.waitForTimeout(2000);
  console.log("row click ->", page.url(), "| no reload:", await stillSamePage());
  console.log("editor visible:", await page.getByTestId("item-summary").isVisible());
  // adjust quantity in editor
  await page.getByRole("spinbutton").first().fill("-5");
  await page.getByRole("button", { name: "Adjust" }).click();
  await page.waitForTimeout(1000);
  console.log("qty after -5:", await text('[data-testid="item-quantity"]'));
  await page.getByRole("spinbutton").first().fill("-999");
  await page.getByRole("button", { name: "Adjust" }).click();
  await page.waitForTimeout(500);
  console.log("alert:", await page.getByRole("alert").innerText().catch(() => "none"));
  // browser back -> folder
  await page.goBack();
  await page.waitForTimeout(1500);
  console.log("back ->", page.url(), "| eq shelfA:", page.url() === shelfA, "| no reload:", await stillSamePage());
  console.log("table total:", await text('[data-testid="qty-total"]'));
  await page.goForward();
  await page.waitForTimeout(1500);
  console.log("forward ->", page.url(), "| editor:", await page.getByTestId("item-summary").isVisible().catch(() => false));
  // toolbar close button (last button in toolbar)
  const closeBtn = page.locator("main button").filter({ has: page.locator("svg") }).last();
  await closeBtn.click();
  await page.waitForTimeout(1500);
  console.log("toolbar X ->", page.url(), "| no reload:", await stillSamePage());
  // the link in the name cell
  if (page.url() !== shelfA) { await tree("Shelf A").click(); await page.waitForTimeout(1000); }
  await page.locator('[data-testid="item-row"] a', { hasText: "Nuts" }).click();
  await page.waitForTimeout(1500);
  console.log("name link ->", page.url(), "| no reload:", await stillSamePage());
  await page.getByRole("button", { name: "← Back to stockroom" }).click();
  await page.waitForTimeout(1500);
  // move Bolts to Shelf B
  await page.getByLabel("Move Bolts to folder").selectOption({ label: "Shelf B" });
  await page.waitForTimeout(2000);
  console.log("Shelf A after move:", await text("main", 300));
  await tree("Shelf B").click();
  await page.waitForTimeout(1500);
  console.log("Shelf B:", await text("main", 300));
  await shot("30-shelf-b-after-move");
  // drive root
  await tree(rootName).click();
  await page.waitForTimeout(1500);
  console.log("root:", await text("main", 300), "| url:", page.url());
  // reload deep link to a folder
  await page.goto(shelfA, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(6000);
  console.log("deep link reload:", await text('[data-testid="folder-title"]'), await text('[data-testid="qty-total"]').catch(() => "no table"));
};
