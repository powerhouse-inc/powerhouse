// Tier-2 e2e: verifies the Connect SPA reads its runtime values from the
// served `/powerhouse.config.json` instead of env vars. The Vite plugin
// `phConfigPlugin` builds the file content from the source
// `powerhouse.config.json` deep-merged with `DEFAULT_CONNECT_CONFIG`; both
// the SPA and these tests fetch the same endpoint.
//
// Source file under test: ../powerhouse.config.json (the vetra-e2e project's
// own powerhouse.config.json). Whatever's there gets served at
// http://localhost:3001/powerhouse.config.json — `pnpm vetra --watch` is
// started by playwright.config.ts's webServer.

import type { Page } from "@playwright/test";
import { expect, test } from "./helpers/fixtures.js";

type RuntimeConfig = {
  schemaVersion: 2;
  packages: Array<{ packageName: string; provider?: string; version?: string }>;
  localPackage: { name: string; version: string } | null;
  packageRegistryUrl?: string;
  connect: {
    app?: {
      logLevel?: string;
      basePath?: string;
      appName?: string;
    };
    renown?: {
      url?: string;
      networkId?: string;
      chainId?: number;
    };
    drives?: {
      defaultDrives?: Array<{
        url: string;
        name: string | null;
        icon: string | null;
      }>;
      sections?: {
        remote?: { enabled?: boolean };
        local?: { enabled?: boolean };
      };
    };
    branding?: { appName?: string };
  };
};

async function fetchRuntimeConfig(page: Page): Promise<RuntimeConfig> {
  const res = await page.request.get("/powerhouse.config.json");
  expect(res.ok()).toBe(true);
  return (await res.json()) as RuntimeConfig;
}

test.describe("runtime-config-read", () => {
  test("vite middleware serves /powerhouse.config.json as application/json 200 (scenarios 49, 51)", async ({
    page,
  }) => {
    await page.goto("/");
    const res = await page.request.get("/powerhouse.config.json");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("application/json");
    // Cache-control: no-cache is the plugin's explicit signal that dev
    // doesn't cache this file (scenario 50 equivalent: a refresh always
    // re-fetches from the dev server).
    expect(res.headers()["cache-control"]).toBe("no-cache");
  });

  test("the SPA-served /powerhouse.config.json has the file-driven top-level packageRegistryUrl (scenario 27)", async ({
    page,
  }) => {
    await page.goto("/");
    const config = await fetchRuntimeConfig(page);
    // The vetra-e2e source config sets packageRegistryUrl to the local registry.
    expect(config.packageRegistryUrl).toBe("http://localhost:8080");
  });

  test("the SPA-served /powerhouse.config.json carries packages[] from source (scenario 28)", async ({
    page,
  }) => {
    await page.goto("/");
    const config = await fetchRuntimeConfig(page);
    expect(Array.isArray(config.packages)).toBe(true);
  });

  test("the SPA-served /powerhouse.config.json has every connect.* leaf populated from defaults (scenarios 24-26)", async ({
    page,
  }) => {
    await page.goto("/");
    const config = await fetchRuntimeConfig(page);
    // The Vite plugin deep-merges DEFAULT_CONNECT_CONFIG under source.connect,
    // so even when the source has an empty/missing `connect` block, every
    // runtime leaf is populated. The SPA can rely on these being present.
    expect(config.connect.renown?.url).toBeDefined();
    expect(config.connect.app?.logLevel).toBeDefined();
    expect(config.connect.drives?.sections?.remote?.enabled).toBeDefined();
    expect(config.connect.drives?.sections?.local?.enabled).toBeDefined();
    expect(config.connect.branding?.appName).toBeDefined();
  });

  test("Connect renders without crashing — boot completes after config load (scenario 29)", async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on("pageerror", (err) => consoleErrors.push(err.message));
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    await page.goto("/");
    await page.waitForLoadState("networkidle");
    // If main.tsx's top-level await missed any boot dependency, the SPA
    // would render with `DEFAULT_CONNECT_CONFIG` placeholders and crash on
    // null-deref of `runtimeConfig`. Either way the page would throw before
    // body content is up.
    const body = await page.locator("body").textContent();
    expect(body).toBeTruthy();

    // Filter out third-party / unrelated noise; surface only Connect-side
    // boot errors that would indicate a config-load race.
    const relevantErrors = consoleErrors.filter((e) =>
      /runtimeConfig|getRuntimeConfig|cache empty|powerhouse\.config/i.test(e),
    );
    expect(relevantErrors).toEqual([]);
  });
});
