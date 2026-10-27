import type { Page } from "@playwright/test";
import { expect, test } from "./helpers/fixtures.js";
import { DESCRIBE_TIMEOUT, LONG_VISIBLE_TIMEOUT } from "./helpers/timeouts.js";
import { waitForAppReady } from "./helpers/wait.js";

test.describe.configure({ timeout: DESCRIBE_TIMEOUT });

// hosts/connect/routes/hello.tsx is outside _app/: a full page, without Connect's sidebar.
test("renders a project route and keeps it in history", async ({ page }) => {
  await page.goto("/hello");
  await waitForAppReady(page);

  const heading = page.getByRole("heading", {
    name: "Hello from a project route",
  });
  // A cold load waits on the reactor, slowest in worker mode.
  await expect(heading).toBeVisible({ timeout: LONG_VISIBLE_TIMEOUT });
  await expect(page.locator("#sidebar")).toHaveCount(0);
  // The loader read the app's PH store.
  await expect(page.getByTestId("hello-drive-count")).toHaveText(/Drives: \d+/);

  await page.getByRole("link", { name: "Home" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(heading).toBeHidden();

  await page.goBack();
  await expect(page).toHaveURL(/\/hello$/);
  await expect(heading).toBeVisible();

  await page.goForward();
  await expect(page).toHaveURL(/\/$/);
  await expect(heading).toBeHidden();
});

async function reportRows(page: Page) {
  const links = page.getByTestId("reports-drives").getByRole("link");
  return (await links.allTextContents()).map((text) => {
    const [, name, count] = /^(.*) \((\d+)\)$/.exec(text) ?? [];
    return { name, count: Number(count) };
  });
}

// hosts/connect/routes/_app/reports.tsx: in Connect's layout, linked from the sidebar by its
// staticData.nav; a layout with search state, and reports/$driveSlug.tsx nests in it.
test("sorts reports through the URL and links into Connect's drive", async ({
  page,
}) => {
  await page.goto("/");
  await waitForAppReady(page);
  await expect(page.getByText("Vetra", { exact: true }).first()).toBeVisible({
    timeout: LONG_VISIBLE_TIMEOUT,
  });

  // A client-side navigation, so the loaders see the drives the app has listed.
  const reportsLink = page.locator('#sidebar a[href$="/reports"]');
  await expect(reportsLink).not.toHaveAttribute("aria-current", "page");
  await reportsLink.click();
  await expect(page).toHaveURL(/\/reports(\?sort=name)?$/);
  await expect(page.getByRole("heading", { name: "Reports" })).toBeVisible();
  await expect(reportsLink).toHaveAttribute("aria-current", "page");
  // The project route sets its own title.
  await expect(page).toHaveTitle("Reports · Vetra E2E");
  const byName = await reportRows(page);
  expect(byName.length).toBeGreaterThan(0);
  expect(byName.map((r) => r.name)).toEqual(
    [...byName.map((r) => r.name)].sort((a, b) => a.localeCompare(b)),
  );

  await page.getByRole("link", { name: "count", exact: true }).click();
  await expect(page).toHaveURL(/\/reports\?sort=count$/);
  await expect(
    page.getByRole("link", { name: "count", exact: true }),
  ).toHaveClass(/font-semibold/);
  const byCount = await reportRows(page);
  expect(byCount.map((r) => r.count)).toEqual(
    [...byCount.map((r) => r.count)].sort((a, b) => b - a),
  );

  const first = byCount[0];
  // The report's heading; its table is empty for a drive without documents.
  const report = page.getByRole("heading", { level: 2, name: first.name });
  await page
    .getByTestId("reports-drives")
    .getByRole("link", { name: `${first.name} (${first.count})` })
    .click();
  await expect(page).toHaveURL(/\/reports\/[^/?]+\?sort=count$/);
  await expect(report).toBeVisible();
  await expect(
    page.getByTestId("reports-drives").locator("a[aria-current='page']"),
  ).toHaveText(`${first.name} (${first.count})`);
  const reportUrl = page.url();

  await page.getByRole("link", { name: "Open in Connect" }).click();
  await expect(page).toHaveURL(/\/d\/[^/?]+/);
  await expect(report).toBeHidden();
  await expect(page).toHaveTitle(`${first.name} · Vetra E2E`);

  await page.goBack();
  await expect(page).toHaveURL(reportUrl);
  await expect(report).toBeVisible();

  await page.goForward();
  await expect(page).toHaveURL(/\/d\/[^/?]+/);
  await expect(report).toBeHidden();
});

test("shows Connect's 404 page, with the sidebar, for an unknown path", async ({
  page,
}) => {
  await page.goto("/no/such/page");
  await waitForAppReady(page);
  await expect(
    page.getByRole("heading", { name: "Page not found" }),
  ).toBeVisible({ timeout: LONG_VISIBLE_TIMEOUT });
  await expect(page).toHaveTitle("Not found · Vetra E2E");
  await expect(page.locator("#sidebar")).toBeVisible();
  await expect(page).toHaveURL(/\/no\/such\/page$/);

  await page.getByRole("link", { name: "Go to the home page" }).click();
  await expect(page).toHaveURL(/\/$/);
});

test("shows the project route's not-found view for an unknown drive", async ({
  page,
}) => {
  await page.goto("/reports/nope");
  await waitForAppReady(page);
  await expect(page.getByText("No such drive.")).toBeVisible({
    timeout: LONG_VISIBLE_TIMEOUT,
  });
  await expect(page.getByRole("heading", { name: "Reports" })).toBeVisible();
});
