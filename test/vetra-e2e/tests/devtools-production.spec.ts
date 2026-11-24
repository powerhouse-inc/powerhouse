// A production build has no DevTools: `ph connect build` output served by
// `ph connect preview` (the connect-preview project, see playwright.config.ts).
import type { Page } from "@playwright/test";
import {
  DEVTOOLS_INFO_PATH,
  DEVTOOLS_PAGE_PATH,
  DEVTOOLS_TOKEN_TAG,
  devtools,
  fetchServedConfig,
  settleFrames,
} from "./helpers/devtools.js";
import { expect, test } from "./helpers/fixtures.js";
import { DESCRIBE_TIMEOUT } from "./helpers/timeouts.js";
import { waitForAppReady } from "./helpers/wait.js";

/** Strings only DevTools' code holds: the launcher's test id and the API's
 * token header. */
const DEVTOOLS_MARKERS = ["ph-launcher", "x-ph-devtools-token"];

test.describe.configure({ timeout: DESCRIBE_TIMEOUT });

// A built Connect is up in seconds. The suite's long timeout would turn a
// build that renders DevTools at this path into a two-hour wait.
const READY_TIMEOUT = 90_000;

async function gotoReadyApp(page: Page, path: string) {
  await page.goto(path);
  await waitForAppReady(page);
  // Connect's chrome is up, so every plugin of the composition has rendered.
  await expect(page.locator("#sidebar")).toBeVisible({
    timeout: READY_TIMEOUT,
  });
}

async function markersIn(page: Page, urls: Iterable<string>) {
  const found: string[] = [];
  for (const url of urls) {
    const response = await page.request.get(url);
    expect(response.ok(), url).toBe(true);
    const body = await response.text();
    for (const marker of DEVTOOLS_MARKERS) {
      if (body.includes(marker)) found.push(`${url} contains ${marker}`);
    }
  }
  return found;
}

test("the page carries no token, and the config says nothing of DevTools", async ({
  page,
}) => {
  const html = await (await page.request.get("/")).text();
  expect(html).not.toMatch(DEVTOOLS_TOKEN_TAG);

  const config = await fetchServedConfig(page);
  expect(JSON.stringify(config).toLowerCase()).not.toContain("devtools");
});

test("a token put in the page turns nothing on: the build has no DevTools", async ({
  page,
}) => {
  await page.route(
    (url) => url.pathname === "/",
    async (route) => {
      const response = await route.fetch();
      const body = (await response.text()).replace(
        "<head>",
        '<head><meta name="ph-devtools-token" content="forged">',
      );
      await route.fulfill({ response, body });
    },
  );
  await gotoReadyApp(page, "/");
  expect(
    await page
      .locator('meta[name="ph-devtools-token"]')
      .getAttribute("content"),
  ).toBe("forged");

  const { launcher, frame } = devtools(page);
  await page.keyboard.press("Alt+Shift+KeyD");
  await settleFrames(page);
  await expect(launcher).toHaveCount(0);
  await expect(frame).toHaveCount(0);
});

test("the app shows no launcher and ignores the DevTools shortcut", async ({
  page,
}) => {
  await gotoReadyApp(page, "/");
  const { launcher, frame } = devtools(page);
  await expect(launcher).toHaveCount(0);
  await expect(frame).toHaveCount(0);

  const url = page.url();
  await page.keyboard.press("Alt+Shift+KeyD");
  await settleFrames(page);
  await expect(launcher).toHaveCount(0);
  await expect(frame).toHaveCount(0);
  expect(page.url()).toBe(url);
});

test("a DevTools share link opens nothing and saves nothing", async ({
  page,
}) => {
  await gotoReadyApp(page, "/?ph-devtools=models");
  const { launcher, frame } = devtools(page);
  await settleFrames(page);
  await expect(launcher).toHaveCount(0);
  await expect(frame).toHaveCount(0);
  expect(new URL(page.url()).searchParams.get("ph-devtools")).toBe("models");
  const saved = await page.evaluate(() =>
    [...Object.keys(localStorage), ...Object.keys(sessionStorage)].filter(
      (key) => key.startsWith("ph-devtools:"),
    ),
  );
  expect(saved).toEqual([]);
});

test("the standalone path is Connect's not-found page", async ({ page }) => {
  await gotoReadyApp(page, DEVTOOLS_PAGE_PATH);
  await expect(
    page.getByRole("heading", { name: "Page not found" }),
  ).toBeVisible({ timeout: READY_TIMEOUT });
  await expect(page).toHaveTitle("Not found · Vetra E2E");
  await expect(devtools(page).frame).toHaveCount(0);
});

test("there is no DevTools API", async ({ page }) => {
  const response = await page.request.get(DEVTOOLS_INFO_PATH, {
    headers: { "x-ph-devtools-token": "any" },
  });
  // A dev server answers JSON even when it refuses the token: here nothing
  // answers but the SPA fallback, or a 404.
  const type = response.headers()["content-type"] ?? "";
  expect(type).not.toContain("json");
  expect(type.includes("text/html") || response.status() === 404).toBe(true);
});

test("no script the app loads holds DevTools code", async ({ page }) => {
  const scripts = new Set<string>();
  page.on("response", (response) => {
    const type = response.headers()["content-type"] ?? "";
    if (/\.m?js(\?|$)/.test(response.url()) || type.includes("javascript")) {
      scripts.add(response.url());
    }
  });
  await gotoReadyApp(page, "/");
  await gotoReadyApp(page, DEVTOOLS_PAGE_PATH);

  expect(scripts.size).toBeGreaterThan(0);
  expect(await markersIn(page, scripts)).toEqual([]);
});

test("no file the service worker precaches holds DevTools code", async ({
  page,
}) => {
  const worker = await page.request.get("/service-worker.js");
  expect(worker.ok()).toBe(true);
  // vite-plugin-pwa's injectManifest inlines the list as {"revision","url"}.
  const precached = [...(await worker.text()).matchAll(/"url":"([^"]+)"/g)].map(
    (match) => match[1],
  );
  const text = precached.filter((url) =>
    /\.(m?js|css|html|json|webmanifest)$/.test(url),
  );
  expect(text.filter((url) => url.endsWith(".js")).length).toBeGreaterThan(100);

  expect(
    await markersIn(
      page,
      text.map((url) => (url.startsWith("/") ? url : `/${url}`)),
    ),
  ).toEqual([]);
});

test("no stylesheet the service worker precaches holds DevTools' CSS", async ({
  page,
}) => {
  const worker = await page.request.get("/service-worker.js");
  expect(worker.ok()).toBe(true);
  const stylesheets = [...(await worker.text()).matchAll(/"url":"([^"]+)"/g)]
    .map((match) => match[1])
    .filter((url) => url.endsWith(".css"));
  expect(stylesheets.length).toBeGreaterThan(0);

  for (const url of stylesheets) {
    const response = await page.request.get(
      url.startsWith("/") ? url : `/${url}`,
    );
    expect(response.ok(), url).toBe(true);
    // The root class every DevTools token and rule is scoped to.
    expect(await response.text(), url).not.toContain(".ph-devtools");
  }
});
