// DevTools in the Connect that `ph vetra` serves: the launcher, the dock, where
// each tab saves its location, the share link, the shortcuts, the standalone
// page and the guarded API.
import type { Page } from "@playwright/test";
import {
  backgroundLightness,
  build,
  DEVTOOLS_INFO_PATH,
  DEVTOOLS_PAGE_PATH,
  DEVTOOLS_TOKEN_HEADER,
  devtools,
  gotoWithDevtools,
  openFromLauncher,
  resetDevtoolsStorage,
  settleFrames,
} from "./helpers/devtools.js";
import { expect, test } from "./helpers/fixtures.js";
import { DESCRIBE_TIMEOUT, LONG_VISIBLE_TIMEOUT } from "./helpers/timeouts.js";

const PROJECT_NAME = "test-package-vetra";
/** The page's place in its tab's history. A DevTools step must not add one. */
const historyLength = (page: Page) => page.evaluate(() => history.length);

/** The Vetra drive in Connect's sidebar: Studio shows it with either reactor.
 * A tab's own SharedWorker reactor does not sync the preview drive. */
const vetraDrive = (page: Page) =>
  page.getByRole("link", { name: "Vetra", exact: true });
const VETRA_DRIVE_URL = /\/d\/vetra-[0-9a-f]{8}(?:[/?#]|$)/;

test.describe.configure({ timeout: DESCRIBE_TIMEOUT });

test.beforeEach(async ({ page }) => {
  await resetDevtoolsStorage(page);
});

test("shows the launcher at the bottom right of the home page", async ({
  page,
}) => {
  await gotoWithDevtools(page, "/");
  const { launcher, launcherBar, frame } = devtools(page);
  await expect(launcher).toBeVisible();
  await expect(frame).toHaveCount(0);

  const box = await launcherBar.boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(viewport!.width - (box!.x + box!.width)).toBeLessThan(80);
  expect(viewport!.height - (box!.y + box!.height)).toBeLessThan(80);
});

test("the launcher opens the dock on Overview", async ({ page }) => {
  await gotoWithDevtools(page, "/");
  const { launcher, frame, panel } = devtools(page);
  const url = page.url();
  await launcher.click();

  await expect(frame).toBeVisible();
  await expect(frame).toHaveAttribute("data-mode", "docked");
  await expect(panel).toHaveAttribute("data-panel", "overview");
  await expect(launcher).toBeHidden();
  expect(page.url()).toBe(url);
});

test("Overview shows the project's name and endpoints", async ({ page }) => {
  await gotoWithDevtools(page, "/");
  await openFromLauncher(page);
  const { info } = devtools(page);

  await expect(info("project")).toContainText(PROJECT_NAME);
  await expect(info("ph-version")).toBeVisible();
  await expect(info("app-url")).toContainText("http://localhost:3001");
  await expect(info("switchboard-url")).toContainText(
    "http://localhost:4002/graphql",
  );
  await expect(info("mcp-url")).toContainText("http://localhost:4002/mcp");
});

test("the dock stays open across reload, Connect navigation and Back", async ({
  page,
}) => {
  await gotoWithDevtools(page, "/");
  await openFromLauncher(page);
  const { frame, overview } = devtools(page);
  const homeUrl = page.url();

  await page.reload();
  await expect(frame).toBeVisible({ timeout: LONG_VISIBLE_TIMEOUT });
  await expect(frame).toHaveAttribute("data-mode", "docked");
  await expect(overview).toHaveAttribute("data-state", "ready");
  expect(page.url()).toBe(homeUrl);

  await vetraDrive(page).click();
  await expect(page).toHaveURL(VETRA_DRIVE_URL);
  expect(page.url()).not.toContain("devtools");
  await expect(frame).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(homeUrl);
  await expect(frame).toBeVisible();
  await expect(frame).toHaveAttribute("data-mode", "docked");
});

test("DevTools never writes to the URL or the tab's history", async ({
  page,
}) => {
  await gotoWithDevtools(page, "/?theme=dark");
  const url = page.url();
  const entries = await historyLength(page);
  await openFromLauncher(page);
  const { launcher, frame, close, panel } = devtools(page);

  await build(page).navItem("models").click();
  await expect(panel).toHaveAttribute("data-panel", "models");
  await close.click();
  await expect(launcher).toBeVisible();
  await expect(frame).toHaveCount(0);

  expect(page.url()).toBe(url);
  expect(await historyLength(page)).toBe(entries);
});

test("a share link opens its panel, then leaves the URL", async ({ page }) => {
  await gotoWithDevtools(page, "/?theme=dark&ph-devtools=models", {
    networkIdle: false,
  });
  const { frame, panel } = devtools(page);
  await expect(frame).toHaveAttribute("data-mode", "docked");
  await expect(panel).toHaveAttribute("data-panel", "models");
  await expect.poll(() => new URL(page.url()).search).toBe("?theme=dark");

  // The link's entry was replaced, so a reload comes from what the tab saved.
  await page.reload();
  await expect(panel).toHaveAttribute("data-panel", "models", {
    timeout: LONG_VISIBLE_TIMEOUT,
  });
  expect(new URL(page.url()).search).toBe("?theme=dark");
});

test("a share link opens its panel on a drive's page and on the standalone page", async ({
  page,
}) => {
  await gotoWithDevtools(page, "/");
  await vetraDrive(page).click();
  await expect(page).toHaveURL(VETRA_DRIVE_URL);
  const drive = new URL(page.url()).pathname;
  const { panel } = devtools(page);

  await gotoWithDevtools(page, `${drive}?ph-devtools=editors`, {
    networkIdle: false,
  });
  await expect(panel).toHaveAttribute("data-panel", "editors");
  await expect.poll(() => new URL(page.url()).pathname).toBe(drive);
  await expect.poll(() => new URL(page.url()).search).toBe("");

  await page.goto(`${DEVTOOLS_PAGE_PATH}?ph-devtools=apps`);
  await expect(panel).toHaveAttribute("data-panel", "apps", {
    timeout: LONG_VISIBLE_TIMEOUT,
  });
  await expect.poll(() => new URL(page.url()).search).toBe("");
});

test("a new tab starts where the last one was, then each tab keeps its own", async ({
  page,
  context,
}) => {
  await gotoWithDevtools(page, "/");
  await openFromLauncher(page);
  const { panel } = devtools(page);
  await build(page).navItem("models").click();
  await expect(panel).toHaveAttribute("data-panel", "models");

  const other = await context.newPage();
  await gotoWithDevtools(other, "/", { networkIdle: false });
  const second = devtools(other);
  await expect(second.panel).toHaveAttribute("data-panel", "models");
  await second.close.click();
  await expect(second.launcher).toBeVisible();

  await page.reload();
  await expect(panel).toHaveAttribute("data-panel", "models", {
    timeout: LONG_VISIBLE_TIMEOUT,
  });
  await other.reload();
  await expect(second.launcher).toBeVisible({ timeout: LONG_VISIBLE_TIMEOUT });
  await expect(second.frame).toHaveCount(0);
});

test("Alt+Shift+D toggles DevTools and Alt+Shift+K opens the palette", async ({
  page,
}) => {
  await gotoWithDevtools(page, "/");
  const { launcher, frame, palette } = devtools(page);

  const url = page.url();
  await page.keyboard.press("Alt+Shift+KeyD");
  await expect(frame).toBeVisible();

  await page.keyboard.press("Alt+Shift+KeyD");
  await expect(frame).toHaveCount(0);
  await expect(launcher).toBeVisible();
  expect(page.url()).toBe(url);

  await page.keyboard.press("Alt+Shift+KeyK");
  await expect(palette).toBeVisible();
  await expect(frame).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(palette).toHaveCount(0);
  await expect(frame).toBeVisible();
});

test("Control+K and Meta+K are left to the app", async ({ page }) => {
  await gotoWithDevtools(page, "/");
  const { frame, palette } = devtools(page);

  for (const key of ["Control+KeyK", "Meta+KeyK"]) {
    await page.keyboard.press(key);
    await settleFrames(page);
    await expect(palette).toHaveCount(0);
    await expect(frame).toHaveCount(0);
    await page.keyboard.press("Escape");
  }

  await openFromLauncher(page);
  for (const key of ["Control+KeyK", "Meta+KeyK"]) {
    await page.keyboard.press(key);
    await settleFrames(page);
    await expect(palette).toHaveCount(0);
    await page.keyboard.press("Escape");
  }
  await expect(frame).toBeVisible();
});

test("the dock side toggle moves the dock and survives a reload", async ({
  page,
}) => {
  await gotoWithDevtools(page, "/");
  await openFromLauncher(page);
  const { frame } = devtools(page);
  await expect(frame).toHaveAttribute("data-dock", "bottom");

  await page.getByRole("button", { name: "Dock to right" }).click();
  await expect(frame).toHaveAttribute("data-dock", "right");
  await page.reload();
  await expect(frame).toHaveAttribute("data-dock", "right", {
    timeout: LONG_VISIBLE_TIMEOUT,
  });

  // A right dock is too narrow for the header toggle: it is in the More menu.
  await page.getByRole("button", { name: "More DevTools options" }).click();
  await page.getByRole("menuitem", { name: "Dock to bottom" }).click();
  await expect(frame).toHaveAttribute("data-dock", "bottom");
  await page.reload();
  await expect(frame).toHaveAttribute("data-dock", "bottom", {
    timeout: LONG_VISIBLE_TIMEOUT,
  });
});

test("the standalone page shows DevTools without Connect", async ({ page }) => {
  await page.goto(DEVTOOLS_PAGE_PATH);
  const { frame, overview, info, launcher } = devtools(page);
  await expect(frame).toBeVisible({ timeout: LONG_VISIBLE_TIMEOUT });
  await expect(frame).toHaveAttribute("data-mode", "standalone");
  await expect(overview).toHaveAttribute("data-state", "ready");
  await expect(info("project")).toContainText(PROJECT_NAME);
  await expect(page.locator("#sidebar")).toHaveCount(0);
  await expect(launcher).toHaveCount(0);

  // One bar: it holds the search, and the frame has no header row of its own.
  const bar = page.getByTestId("ph-devtools-bar");
  await expect(bar.getByTestId("ph-devtools-search")).toBeVisible();
  await expect(frame.locator(":scope > header")).toHaveCount(0);
  await bar.getByTestId("ph-devtools-search").click();
  await expect(page.getByTestId("ph-devtools-palette")).toBeVisible();
});

test("the dock follows Connect's theme", async ({ page }) => {
  const { frame } = devtools(page);

  await gotoWithDevtools(page, "/?theme=light&ph-devtools=overview");
  await expect(frame).toBeVisible();
  await expect(page.locator("html")).not.toHaveClass(/\bdark\b/);
  const light = await backgroundLightness(page, "ph-devtools");

  await gotoWithDevtools(page, "/?theme=dark&ph-devtools=overview");
  await expect(frame).toBeVisible();
  await expect(page.locator("html")).toHaveClass(/\bdark\b/);
  const dark = await backgroundLightness(page, "ph-devtools");

  expect(light).toBeGreaterThan(0.8);
  expect(dark).toBeLessThan(0.3);
});

test("the API answers only the page's token, origin and host", async ({
  page,
}) => {
  await gotoWithDevtools(page, "/");
  const token = await page
    .locator('meta[name="ph-devtools-token"]')
    .getAttribute("content");
  expect(token).toBeTruthy();
  const withToken = { [DEVTOOLS_TOKEN_HEADER]: token! };

  const noToken = await page.request.get(DEVTOOLS_INFO_PATH);
  expect(noToken.status()).toBe(401);

  const ok = await page.request.get(DEVTOOLS_INFO_PATH, { headers: withToken });
  expect(ok.status()).toBe(200);
  const body = (await ok.json()) as { project: { name: string | null } };
  expect(body.project.name).toBe(PROJECT_NAME);

  const crossOrigin = await page.request.get(DEVTOOLS_INFO_PATH, {
    headers: { ...withToken, origin: "http://localhost:9999" },
  });
  expect(crossOrigin.status()).toBe(403);

  // Vite's host check may refuse it before the DevTools guard does.
  const foreignHost = await page.request.get(DEVTOOLS_INFO_PATH, {
    headers: { ...withToken, host: "devtools.example:3001" },
  });
  expect(foreignHost.status()).toBe(403);
});
