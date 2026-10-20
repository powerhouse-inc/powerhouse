// Screenshots of core's views in a Connect built without the generic plugin.
// Usage: apps/connect/CUSTOMIZING.md, "UI screenshots of core's views".
import { chromium, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import {
  CONNECT,
  ensureServers,
  goto,
  openSeededPage,
  PKG,
  type Seeded,
} from "./ui-stack.js";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    out: { type: "string", default: join(PKG, ".ui-shots") },
    theme: { type: "string", default: "light" },
    width: { type: "string", default: "1440" },
    height: { type: "string", default: "900" },
    list: { type: "boolean", default: false },
    serve: { type: "boolean", default: false },
    generic: { type: "boolean", default: false },
  },
});

// ─── scenes ─────────────────────────────────────────────────────────────────

// A scene opens a path, then runs steps against core's views; --generic
// skips the steps, since the classic chrome has none of them.
interface Scene {
  path: (paths: Seeded["paths"]) => string;
  steps?: (page: Page) => Promise<void>;
}

const listing = (page: Page) =>
  page.getByRole("table", { name: "Directory listing" });

const SCENES: Record<string, Scene> = {
  "home-index": {
    path: () => "/",
    steps: (page) =>
      page
        .getByRole("table", { name: "Drives" })
        .getByRole("link", { name: "Projects/" })
        .waitFor(),
  },
  "drive-listing": {
    path: (paths) => paths.drive,
    steps: (page) => listing(page).getByText("test/todo").first().waitFor(),
  },
  "folder-listing": {
    path: (paths) => paths.folder,
    steps: (page) =>
      listing(page).getByRole("link", { name: "2026/" }).waitFor(),
  },
  "document-editor": {
    path: (paths) => paths.todo,
    steps: async (page) => {
      await page.locator('[data-editor="todo-editor"]').waitFor();
      await page.getByText("Review core's views").first().waitFor();
    },
  },
  "document-history": {
    path: (paths) => `${paths.todo}?history`,
    steps: (page) =>
      page.getByRole("table", { name: "global operations" }).waitFor(),
  },
  "document-json": {
    path: (paths) => paths.group,
    steps: async (page) => {
      const state = page.getByLabel("Document state");
      await state.waitFor();
      // Opens the first collapsed node under the scopes.
      await state.locator("details:not([open]) > summary").first().click();
    },
  },
  "settings-appearance": {
    path: () => "/settings/appearance",
    steps: (page) => page.getByRole("radio", { name: "Dark" }).waitFor(),
  },
  "settings-packages": {
    path: () => "/settings/packages",
    steps: (page) =>
      page
        .getByRole("table", { name: /document models$/ })
        .first()
        .waitFor(),
  },
  "not-found": {
    path: () => "/no/such/page",
    steps: (page) => page.getByTestId("not-found-path").waitFor(),
  },
  // A drive whose app no loaded package provides: core shows its listing.
  "drive-app": {
    path: (paths) => paths.driveApp,
    steps: (page) =>
      listing(page).getByRole("link", { name: "Designs/" }).waitFor(),
  },
  "theme-toggle": {
    path: () => "/",
    steps: async (page) => {
      await page.getByRole("button", { name: /^Switch to .* theme$/ }).click();
      await page.mouse.move(0, 400);
    },
  },
};

// ─── main ───────────────────────────────────────────────────────────────────

async function settle(page: Page) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(600);
}

// Noise from blocking the service worker, not from the views.
const IGNORED =
  /Service Worker registration blocked|ServiceWorker registration failed/;

async function main() {
  if (values.list) {
    console.log(Object.keys(SCENES).join("\n"));
    return;
  }
  const colorScheme = values.theme === "dark" ? "dark" : "light";
  if (values.serve) {
    const started = await ensureServers();
    // The overrides live in this browser context, so use this window.
    // The installed Chrome: Playwright may only have the headless shell.
    const window = {
      headless: false,
      args: [`--window-size=${values.width},${values.height}`],
    };
    const browser = await chromium
      .launch({ ...window, channel: "chrome" })
      .catch(() => chromium.launch(window));
    const { page } = await openSeededPage(browser, {
      colorScheme,
      viewport: null,
      generic: values.generic,
    });
    await goto(page, "/");
    console.log(`Connect ${CONNECT} — seeded browser open, Ctrl-C to stop`);
    const stop = () => {
      void browser.close();
      for (const child of started) child.kill();
      process.exit(0);
    };
    browser.on("disconnected", stop);
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
    await new Promise(() => {});
  }
  const wanted = positionals.length ? positionals : Object.keys(SCENES);
  for (const name of wanted) {
    if (!(name in SCENES))
      throw new Error(`Unknown scene "${name}" (see --list)`);
  }

  const started = await ensureServers();
  const browser = await chromium.launch();
  try {
    const { page, seeded } = await openSeededPage(browser, {
      colorScheme,
      viewport: { width: Number(values.width), height: Number(values.height) },
      generic: values.generic,
    });
    page.on("pageerror", (e) => console.warn(`  [pageerror] ${e.message}`));
    page.on("console", (message) => {
      if (message.type() !== "error" || IGNORED.test(message.text())) return;
      console.warn(`  [console] ${message.text().split("\n")[0]}`);
    });

    mkdirSync(values.out, { recursive: true });
    const suffix =
      (values.generic ? "-generic" : "") +
      (colorScheme === "dark" ? "-dark" : "");
    for (const name of wanted) {
      // Back to the system theme, after theme-toggle stored a choice.
      await page.evaluate(() => localStorage.removeItem("ph:theme"));
      try {
        const scene = SCENES[name];
        await goto(page, scene.path(seeded.paths));
        if (values.generic) await page.waitForTimeout(1500);
        else await scene.steps?.(page);
      } catch (error) {
        // The shot still shows what rendered instead.
        console.warn(`  ✗ ${name}: ${String(error).split("\n")[0]}`);
      }
      await settle(page);
      const file = join(values.out, `${name}${suffix}.png`);
      await page.screenshot({ path: file });
      console.log(`✓ ${file}`);
    }
  } finally {
    await browser.close();
    for (const child of started) child.kill();
  }
}

await main();
