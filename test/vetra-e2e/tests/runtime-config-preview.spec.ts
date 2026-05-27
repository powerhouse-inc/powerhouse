// Production-mode runtime-config tests. Distinct from runtime-config-read.spec.ts,
// which targets `ph vetra --watch` (dev mode, content served from an in-memory
// closure in phConfigPlugin). These tests run against `ph connect build &&
// ph connect preview` — the dist/powerhouse.config.json is a real file on disk
// served as static, so editing it + browser refresh actually re-reads it.
//
// The connect-preview Playwright project (see playwright.config.ts) wires
// these tests up: baseURL = http://localhost:4173, depends on vetra-dev so
// the existing dev-mode tests cannot collide on shared files.

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
// Isolated outDir — see playwright.config.ts's connect-preview webServer for
// why this is NOT `dist/` (the package `pnpm build` would trash it).
const DIST_DIR = path.join(PROJECT_ROOT, "dist-connect");
const DIST_CONFIG = path.join(DIST_DIR, "powerhouse.config.json");

test.describe.configure({ mode: "serial" });

test.describe("runtime-config-preview", () => {
  test("editing dist/powerhouse.config.json + browser refresh reflects new value", async ({
    page,
  }) => {
    const original = fs.readFileSync(DIST_CONFIG, "utf-8");
    try {
      await page.goto("/");
      const before = (await (
        await page.request.get("/powerhouse.config.json")
      ).json()) as { packageRegistryUrl: string };
      expect(before.packageRegistryUrl).toBe("http://localhost:8080");

      const modified = {
        ...(JSON.parse(original) as Record<string, unknown>),
        packageRegistryUrl: "http://localhost:9999",
      };
      fs.writeFileSync(DIST_CONFIG, JSON.stringify(modified, null, 2));

      // Browser refresh re-fetches /powerhouse.config.json from disk. The
      // preview server is static (vite preview / serve-static), so this
      // returns the edited content without restarting the server.
      await page.reload();

      const after = (await (
        await page.request.get("/powerhouse.config.json")
      ).json()) as { packageRegistryUrl: string };
      expect(after.packageRegistryUrl).toBe("http://localhost:9999");
    } finally {
      fs.writeFileSync(DIST_CONFIG, original);
    }
  });

  test("source connect.branding.appName overrides the default in the built dist config", async ({
    page,
  }) => {
    await page.goto("/");
    const config = (await (
      await page.request.get("/powerhouse.config.json")
    ).json()) as { connect: { branding: { appName: string } } };
    // Source `powerhouse.config.json` sets "Vetra E2E"; the default in
    // DEFAULT_CONNECT_CONFIG is "Powerhouse Connect". A match here means the
    // source value won over the default in the deep-merge.
    expect(config.connect.branding.appName).toBe("Vetra E2E");
  });

  test("--packages-registry CLI flag overrides packageRegistryUrl at build time", async () => {
    const scratchDir = `dist-cli-test-${Date.now()}`;
    const scratchPath = path.join(PROJECT_ROOT, scratchDir);
    try {
      // Build into an isolated outDir so we don't trample the preview
      // server's dist-connect/. The current precedence ladder in
      // builder-tools/connect-utils/vite-config.ts:221-222 is
      // `cliPackageRegistryUrl ?? phConfig.packageRegistryUrl ?? null` — there
      // is no env-var layer post-#2645, so this exercises the *real* override
      // mechanism, not an imagined env var.
      execSync(
        `pnpm exec ph-cli connect build --outDir ${scratchDir} --packages-registry https://cli.example`,
        {
          cwd: PROJECT_ROOT,
          stdio: "pipe",
        },
      );
      const content = JSON.parse(
        fs.readFileSync(
          path.join(scratchPath, "powerhouse.config.json"),
          "utf-8",
        ),
      ) as { packageRegistryUrl: string };
      // Source file has packageRegistryUrl = "http://localhost:8080"; the CLI
      // flag should win per the precedence ladder: CLI > file > defaults.
      expect(content.packageRegistryUrl).toBe("https://cli.example");
    } finally {
      fs.rmSync(scratchPath, { recursive: true, force: true });
    }
  });

  test("Connect SPA applies branding.appName to document.title after boot", async ({
    page,
  }) => {
    // applyConnectBranding() is called in apps/connect/src/components/load.tsx
    // during boot; it writes runtimeConfig.connect.branding.appName to
    // document.title. toHaveTitle retries with timeout so this tolerates the
    // async boot chain.
    await page.goto("/");
    await expect(page).toHaveTitle("Vetra E2E");
  });
});
