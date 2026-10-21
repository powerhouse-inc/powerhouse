import { expect, test, type Page } from "@playwright/test";
import { existsSync, realpathSync } from "node:fs";
import path from "node:path";
import { STUDIO_URL } from "../playwright.studio.config.js";
import { PROJECT_DIR } from "../scripts/lib/project.js";

// Connect served from node_modules fails differently from a linked checkout:
// Vite pre-bundles nothing a file inside node_modules imports, so a CommonJS
// package under Connect's routes reaches the browser raw and the app never
// mounts. These say the module graph broke, not that a request was refused.
const MODULE_ERROR =
  /does not provide an export named|Failed to resolve module specifier|Failed to fetch dynamically imported module|SyntaxError/;

const IN_NODE_MODULES = /[\\/]node_modules[\\/]/;

/** The real directory of `pkg` as Node finds it from `dir`. */
function packageDir(pkg: string, dir: string): string {
  for (let at = dir; ; at = path.dirname(at)) {
    const candidate = path.join(at, "node_modules", pkg);
    if (existsSync(candidate)) return realpathSync(candidate);
    if (path.dirname(at) === at)
      throw new Error(`${pkg} not found from ${dir}`);
  }
}

function collectBootErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error" && MODULE_ERROR.test(message.text())) {
      errors.push(`console: ${message.text()}`);
    }
  });
  // A module the dev server failed to transform (504 is Vite's own "reload,
  // the pre-bundle changed", which the warm-up load absorbs).
  page.on("response", (response) => {
    if (response.url().startsWith(STUDIO_URL) && response.status() === 500) {
      errors.push(`500: ${response.url()}`);
    }
  });
  return errors;
}

/** Loads Connect and waits for its sidebar, or the first module error. */
async function bootOf(page: Page, errors: string[], timeout: number) {
  await page.goto("/");
  const sidebar = page.locator("#sidebar");
  await expect
    .poll(async () => errors.length > 0 || (await sidebar.isVisible()), {
      timeout,
    })
    .toBe(true)
    .catch(() => undefined);
}

test("connect studio boots in a project installed from the published packages", async ({
  context,
}) => {
  test.setTimeout(300_000);

  // Installed, not linked: a link resolves into the workspace, where Vite
  // treats Connect as source and the bug this guards against cannot happen.
  const phCli = packageDir("@powerhousedao/ph-cli", PROJECT_DIR);
  for (const [pkg, from] of [
    ["@powerhousedao/connect", PROJECT_DIR],
    ["@powerhousedao/builder-tools", phCli],
  ]) {
    expect(packageDir(pkg, from), `${pkg} is installed, not linked`).toMatch(
      IN_NODE_MODULES,
    );
  }

  // The first load may find a dependency the scan missed; Vite then
  // re-bundles and reloads the page. Let that settle before asserting.
  const warmUp = await context.newPage();
  await bootOf(warmUp, collectBootErrors(warmUp), 120_000);
  await warmUp.close();

  const page = await context.newPage();
  const errors = collectBootErrors(page);
  await bootOf(page, errors, 60_000);
  expect(errors, "Connect boots without module errors").toEqual([]);
  await expect(page.locator("#sidebar")).toBeVisible();
});
