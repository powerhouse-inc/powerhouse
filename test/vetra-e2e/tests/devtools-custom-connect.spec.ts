// DevTools in a project's own Connect: test/versioned-documents, with its own
// routes and styles, served by `ph run connect dev` without `ph vetra`.
import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import {
  build,
  DEVTOOLS_PAGE_PATH,
  DEVTOOLS_TOKEN_TAG,
  devtools,
  dropFromComposition,
  expectFocus,
  fetchServedConfig,
  GENERIC_PLUGIN,
  gotoBuildPage,
  gotoWithDevtools,
  modelFocus,
  openFromLauncher,
  resetDevtoolsStorage,
} from "./helpers/devtools.js";
import { expect, test } from "./helpers/fixtures.js";
import { DESCRIBE_TIMEOUT, LONG_VISIBLE_TIMEOUT } from "./helpers/timeouts.js";

const PROJECT_NAME = (
  JSON.parse(
    readFileSync(
      new URL("../../versioned-documents/package.json", import.meta.url),
      "utf8",
    ),
  ) as { name: string }
).name;

// hosts/connect/host.js runs the reactor in a SharedWorker.
const WORKER_REACTOR = { networkIdle: false };

test.describe.configure({ timeout: DESCRIBE_TIMEOUT });

test.beforeEach(async ({ page }) => {
  await resetDevtoolsStorage(page);
});

async function expectOverviewOfThisProject(page: Page) {
  const { info } = devtools(page);
  await expect(info("project")).toContainText(PROJECT_NAME);
  await expect(info("app-url")).toContainText("http://localhost:3002");
  // No `ph vetra` runs: Connect alone has no Switchboard and no MCP.
  await expect(info("switchboard-url")).not.toContainText("http");
  await expect(info("mcp-url")).not.toContainText("http");
}

test("shows the launcher and opens Overview for the project", async ({
  page,
}) => {
  await gotoWithDevtools(page, "/", WORKER_REACTOR);
  await expect(devtools(page).launcher).toBeVisible();
  await openFromLauncher(page);
  await expectOverviewOfThisProject(page);
});

test("the dock stays open on the project's routes", async ({ page }) => {
  await gotoWithDevtools(page, "/", WORKER_REACTOR);
  await openFromLauncher(page);
  const { frame, launcher } = devtools(page);

  // hosts/connect/routes/_app/reports.tsx, in Connect's layout.
  await page.locator('#sidebar a[href$="/reports"]').click();
  await expect(page).toHaveURL(/\/reports(\?|$)/);
  expect(page.url()).not.toContain("devtools");
  await expect(page.getByRole("heading", { name: "Reports" })).toBeVisible();
  await expect(frame).toBeVisible();
  await expect(frame).toHaveAttribute("data-mode", "docked");

  // hosts/connect/routes/hello.tsx, a full page without Connect's sidebar.
  await gotoWithDevtools(page, "/hello", WORKER_REACTOR);
  await expect(
    page.getByRole("heading", { name: "Hello from a project route" }),
  ).toBeVisible({ timeout: LONG_VISIBLE_TIMEOUT });
  await expect(page.locator("#sidebar")).toHaveCount(0);
  await expect(frame).toBeVisible();
  await expect(launcher).toBeHidden();
});

test("the standalone page renders", async ({ page }) => {
  await page.goto(DEVTOOLS_PAGE_PATH);
  const { frame, overview, info, launcher } = devtools(page);
  await expect(frame).toBeVisible({ timeout: LONG_VISIBLE_TIMEOUT });
  await expect(frame).toHaveAttribute("data-mode", "standalone");
  await expect(overview).toHaveAttribute("data-state", "ready");
  await expect(info("project")).toContainText(PROJECT_NAME);
  await expect(launcher).toHaveCount(0);
});

test("DevTools works without the generic plugin", async ({ page }) => {
  await dropFromComposition(page, GENERIC_PLUGIN);
  await gotoWithDevtools(page, "/", WORKER_REACTOR);
  const config = await page.evaluate(async () => {
    const response = await fetch("/powerhouse.config.json");
    return (await response.json()) as {
      connect: { composition: { module: string }[] };
    };
  });
  expect(config.connect.composition.map((e) => e.module)).not.toContain(
    GENERIC_PLUGIN,
  );

  await expect(devtools(page).launcher).toBeVisible();
  await openFromLauncher(page);
  await expectOverviewOfThisProject(page);
});

// The project's code: document-models/todo, with two versions, and
// editors/todo-editor. No Vetra drive is involved.
test("Build shows the modules in the project's code", async ({ page }) => {
  const TODO = "test/todo";
  const EDITOR = "todo-editor";
  const {
    model,
    operation,
    operationLink,
    moduleRow,
    moduleTab,
    check,
    emptyKind,
    navItem,
  } = build(page);

  await gotoBuildPage(page, "models");
  await expect(model(TODO)).toBeVisible({ timeout: LONG_VISIBLE_TIMEOUT });
  await expect(page.getByTestId("ph-model-name")).toHaveText("Todo");

  // Version 2 added EDIT_TITLE.
  await expect(operationLink("EDIT_TITLE")).toBeVisible();
  await page.getByTestId("ph-model-version-switcher").click();
  await page
    .locator('[data-testid="ph-model-version-option"][data-version="1"]')
    .click();
  await expectFocus(page, modelFocus(TODO, { version: 1 }));
  await expect(operationLink("ADD_TODO")).toBeVisible();
  await expect(operationLink("EDIT_TITLE")).toHaveCount(0);

  await operationLink("ADD_TODO").click();
  await expectFocus(
    page,
    modelFocus(TODO, { version: 1, item: "op:ADD_TODO" }),
  );
  await expect(
    operation("ADD_TODO").getByTestId("ph-operation-input"),
  ).toContainText("input AddTodoInput");

  await navItem("editors").click();
  await expect(moduleRow(EDITOR)).toHaveAttribute("aria-selected", "true");
  await moduleTab("checks").click();
  await expect(check("registered")).toHaveText(
    "Registered in editors/editors.ts",
  );
  await expect(check("loaded")).toHaveText("Loaded in this tab");

  await navItem("apps").click();
  await expect(emptyKind("app").getByTestId("ph-command")).toContainText(
    "ph generate app --name <name>",
  );
});

test("the page's token turns DevTools on, and the config says nothing of it", async ({
  page,
}) => {
  const html = await (await page.request.get("/")).text();
  expect(html).toMatch(DEVTOOLS_TOKEN_TAG);

  const config = await fetchServedConfig(page);
  expect(JSON.stringify(config).toLowerCase()).not.toContain("devtools");
});
