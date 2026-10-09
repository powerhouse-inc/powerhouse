import type { Page } from "@playwright/test";
import {
  canvasNode,
  coreTrigger,
  createWorkflowInBrowser,
  openPicker,
  openWorkflowEditor,
  pieceAction,
  shot,
  waitServed,
  workflowState,
} from "../../scripts/ui-stack.js";
import { expect, test } from "./fixtures.js";

interface Steps {
  steps: {
    name: string;
    pieceName: string;
    pieceVersion: string;
    actionName: string;
    config: Record<string, unknown>;
  }[];
}

const VERSION = /^v\d+\.\d+\.\d+/;

// The append button under the workflow's last step.
const addStep = (app: Page) =>
  app.getByRole("button", { name: /^Add step/ }).last();

test.describe("Block picker", () => {
  test("shows a block's version on hover and pins what it adds", async ({
    stack,
    app,
  }) => {
    // Tall enough for the picker to open below the last step.
    await app.setViewportSize({ width: 1440, height: 1400 });
    await openWorkflowEditor(app);
    await openPicker(app, addStep(app));
    await app.getByRole("tab", { name: "Powerhouse", exact: true }).click();
    const row = app
      .getByRole("option")
      .filter({ hasText: "Reads a document's current state" });
    const version = row.getByText(VERSION);
    // Every row pins the same installed version: it only says so on hover.
    await expect(version).toBeHidden();
    await row.hover();
    await expect(version).toBeVisible();
    await shot(app, "block-picker-versions");
    // Core blocks show no version.
    await app.getByRole("tab", { name: "Core", exact: true }).click();
    const branch = app
      .getByRole("option")
      .filter({ hasText: "Routes true/false" });
    await branch.hover();
    await expect(branch.getByText(VERSION)).toHaveCount(0);
    await app.getByRole("tab", { name: "Powerhouse", exact: true }).click();

    await row.click();
    await expect
      .poll(async () =>
        (await workflowState<Steps>(app, stack.seeded.digest)).steps.find(
          (step) => step.actionName === "document-get",
        ),
      )
      .toMatchObject({
        pieceName: "@powerhousedao/piece-reactor",
        pieceVersion: expect.stringMatching(/^\d+\.\d+\.\d+/),
      });
  });

  test("a picked step appears at once and stores its defaults once the form loads", async ({
    stack,
    app,
  }) => {
    await app.setViewportSize({ width: 1440, height: 1400 });
    await openWorkflowEditor(app);
    // Forms are held back until the step shows: it must not wait for one.
    let release = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    await app.route("**/graphql/workflow-runtime", async (route) => {
      if (route.request().postData()?.includes("blockDescriptor")) await held;
      await route.continue();
    });
    await openPicker(app, addStep(app));
    await app.getByRole("tab", { name: "Powerhouse", exact: true }).click();
    const row = app
      .getByRole("option")
      .filter({ hasText: "Lists documents by type and name" });
    await row.hover();
    await row.click();
    await expect(canvasNode(app, "Find documents")).toBeVisible();
    release();

    const step = async () =>
      (await workflowState<Steps>(app, stack.seeded.digest)).steps.find(
        (entry) => entry.actionName === "document-find",
      );
    // document-find declares includeState with a default of false.
    await expect
      .poll(async () => (await step())?.config)
      .toMatchObject({
        includeState: false,
      });
    await canvasNode(app, "Find documents").click();
    await expect(app.getByLabel("Include state")).not.toBeChecked();
    await app.getByRole("button", { name: "Close panel" }).click();
    // The add and the defaults that followed it are one edit to undo.
    await app.keyboard.press("ControlOrMeta+z");
    await expect.poll(step).toBeUndefined();
    await expect(canvasNode(app, "Find documents")).toHaveCount(0);
  });

  test("a picked step opens its panel, with no connection field before its form says so", async ({
    app,
  }) => {
    await openWorkflowEditor(app);
    let release = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    await app.route("**/graphql/workflow-runtime", async (route) => {
      if (route.request().postData()?.includes("blockDescriptor")) await held;
      await route.continue();
    });
    await openPicker(app, addStep(app));
    await app.getByRole("tab", { name: "Powerhouse", exact: true }).click();
    await app
      .getByRole("option")
      .filter({ hasText: "Lists documents by type and name" })
      .click();

    const closePanel = app.getByRole("button", { name: "Close panel" });
    const connection = app.getByRole("button", { name: "Choose a connection" });
    await expect(closePanel).toBeVisible();
    await expect(connection).toHaveCount(0);
    release();
    await expect(app.getByLabel("Include state")).toBeVisible();
    await expect(connection).toHaveCount(0);
  });

  test("search groups matching blocks under their piece", async ({ app }) => {
    await app.setViewportSize({ width: 1440, height: 1400 });
    await openWorkflowEditor(app);
    await openPicker(app, addStep(app));
    const search = app.getByPlaceholder("Search pieces and actions…");
    // Out of order, and one token naming the piece rather than the block.
    await search.fill("request http");
    const header = app.getByTitle("Open HTTP", { exact: true });
    await expect(header).toBeVisible();
    await expect(
      app.getByRole("option").filter({ hasText: /^Send HTTP request/ }),
    ).toBeVisible();
    await shot(app, "block-picker-search");

    // The header opens the piece in the browse panes; Escape backs out.
    await header.click();
    await expect(search).toHaveValue("");
    await expect(search).toBeFocused();
    await expect(
      app.getByRole("option").filter({ hasText: /^Send HTTP request/ }),
    ).toBeVisible();
    // Logos mount with the panes; the shot waits for them.
    await app.waitForFunction(() =>
      [...document.querySelectorAll("[data-selector-open] img")].every(
        (image) => (image as HTMLImageElement).complete,
      ),
    );
    await shot(app, "block-picker-browse");
    await app.keyboard.press("Escape");
    await expect(search).toBeVisible();
    await app.keyboard.press("Escape");
    await expect(search).toHaveCount(0);
  });

  test("picks with the keyboard and remembers the pick", async ({ app }) => {
    await app.setViewportSize({ width: 1440, height: 1400 });
    await openWorkflowEditor(app);
    await openPicker(app, addStep(app));
    await app
      .getByPlaceholder("Search pieces and actions…")
      .fill("send http request");
    await expect(
      app.getByRole("option").filter({ hasText: /^Send HTTP request/ }),
    ).toBeVisible();
    // The best block is the keyboard's row from the start.
    await app.keyboard.press("Enter");
    await expect(canvasNode(app, "Send HTTP request")).toBeVisible();

    await openPicker(app, addStep(app));
    const recent = app
      .getByRole("option")
      .filter({ hasText: /^Recently used/ });
    await expect(recent).toBeVisible();
    await recent.click();
    await expect(
      app.getByRole("option").filter({ hasText: /^Send HTTP request/ }),
    ).toBeVisible();
  });

  test("points assistive tech at the keyboard's row, and tabs take arrows", async ({
    app,
  }) => {
    await app.setViewportSize({ width: 1440, height: 1400 });
    await openWorkflowEditor(app);
    await openPicker(app, addStep(app));
    const search = app.getByRole("combobox");
    await expect(search).toBeFocused();
    const activeOption = async () => {
      const id = await search.getAttribute("aria-activedescendant");
      return app.locator(`[id="${id}"]`);
    };
    await expect(await activeOption()).toHaveAttribute("aria-selected", "true");
    await expect(await activeOption()).toContainText("Core");
    await app.keyboard.press("ArrowDown");
    await expect(await activeOption()).toContainText("Documents");
    // Into the blocks, and back.
    await app.keyboard.press("ArrowRight");
    await expect(await activeOption()).toContainText("Create document");
    await app.keyboard.press("ArrowLeft");
    await expect(await activeOption()).toContainText("Documents");

    // Tab reaches the selected tab; arrows move along the tabs.
    await app.keyboard.press("Tab");
    const all = app.getByRole("tab", { name: "All", exact: true });
    await expect(all).toBeFocused();
    await app.keyboard.press("ArrowRight");
    const core = app.getByRole("tab", { name: "Core", exact: true });
    await expect(core).toBeFocused();
    await expect(core).toHaveAttribute("aria-selected", "true");
    await app.keyboard.press("Escape");
    await expect(search).toHaveCount(0);
  });

  test("stays on screen near the bottom edge", async ({ app }) => {
    await app.setViewportSize({ width: 1280, height: 720 });
    await openWorkflowEditor(app);
    await openPicker(app, addStep(app));
    const box = await app.locator('[data-selector-open="true"]').boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(720);
    expect(box!.x + box!.width).toBeLessThanOrEqual(1280);
  });

  test("closes on a click on the canvas", async ({ app }) => {
    await openWorkflowEditor(app);
    await openPicker(app, addStep(app));
    const search = app.getByPlaceholder("Search pieces and actions…");
    await expect(search).toBeVisible();
    // The pane's top-left corner holds no node.
    await app
      .locator(".react-flow__pane")
      .click({ position: { x: 20, y: 20 } });
    await expect(search).toHaveCount(0);
    // Its own button still toggles it.
    await openPicker(app, addStep(app));
    await addStep(app).click();
    await expect(search).toHaveCount(0);
  });

  test("a changed trigger opens its panel", async ({ app }) => {
    await openWorkflowEditor(app);
    await app
      .locator(".react-flow__node-apStep")
      .first()
      .click({ button: "right" });
    await app.getByRole("button", { name: "Change trigger" }).click();
    await app
      .getByRole("option", { name: /^Manual/ })
      .first()
      .click();
    await expect(
      app.getByRole("button", { name: "Close panel" }),
    ).toBeVisible();
  });

  test.describe("in dark mode", () => {
    test.use({ theme: "dark" });

    test("browses and searches on a dark card", async ({ app }) => {
      await app.setViewportSize({ width: 1440, height: 1400 });
      await openWorkflowEditor(app);
      const picker = await openPicker(app, addStep(app));
      await app.keyboard.press("ArrowDown");
      await app.keyboard.press("ArrowRight");
      await expect(
        picker
          .getByRole("listbox", { name: "Documents actions" })
          .getByRole("option", { selected: true }),
      ).toContainText("Create document");
      await shot(app, "block-picker-dark-browse");
      await app
        .getByPlaceholder("Search pieces and actions…")
        .fill("request http");
      await expect(
        app.getByRole("option").filter({ hasText: /^Send HTTP request/ }),
      ).toBeVisible();
      await app.waitForFunction(() =>
        [...document.querySelectorAll("[data-selector-open] img")].every(
          (image) => (image as HTMLImageElement).complete,
        ),
      );
      await shot(app, "block-picker-dark-search");
    });
  });

  test.describe("on a workflow of its own", () => {
    test.use({ seed: false });

    test("shows the version unasked when other steps use another one", async ({
      stack,
      app,
    }) => {
      const http = await pieceAction(
        "@activepieces/piece-http",
        "send_request",
      );
      const id = await createWorkflowInBrowser(app, stack.drive, {
        name: "Mixed versions",
        enabled: false,
        trigger: { ...(await coreTrigger("manual")), config: {} },
        steps: [
          {
            key: "old",
            name: "Old call",
            ...http,
            pieceVersion: "90.0.0",
            config: { method: "GET", url: "http://127.0.0.1:1/x" },
          },
        ],
      });
      await waitServed(id, "old");
      await openWorkflowEditor(app, "Mixed versions");
      await canvasNode(app, "Old call").waitFor();
      await openPicker(app, addStep(app));
      await app.getByPlaceholder("Search pieces and actions…").fill("HTTP");
      const row = app
        .getByRole("option")
        .filter({ hasText: "Send HTTP request" })
        .first();
      const version = row.getByText(VERSION);
      await expect(version).toBeVisible();
      await expect(version).toHaveAttribute(
        "title",
        "Other steps of this workflow use v90.0.0",
      );
    });
  });
});
