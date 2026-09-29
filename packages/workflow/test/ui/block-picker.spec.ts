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
    await app.getByRole("button", { name: "Powerhouse", exact: true }).click();
    const row = app
      .getByRole("button")
      .filter({ hasText: "Reads a document's current state" });
    const version = row.getByText(VERSION);
    // Every row pins the same installed version: it only says so on hover.
    await expect(version).toBeHidden();
    await row.hover();
    await expect(version).toBeVisible();
    await shot(app, "block-picker-versions");
    // Core blocks show no version.
    await app.getByRole("button", { name: "Core", exact: true }).click();
    const branch = app
      .getByRole("button")
      .filter({ hasText: "Routes true/false" });
    await branch.hover();
    await expect(branch.getByText(VERSION)).toHaveCount(0);
    await app.getByRole("button", { name: "Powerhouse", exact: true }).click();

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
    await app.getByRole("button", { name: "Powerhouse", exact: true }).click();
    const row = app
      .getByRole("button")
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
    await app.getByRole("button", { name: "Powerhouse", exact: true }).click();
    await app
      .getByRole("button")
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

  test("a changed trigger opens its panel", async ({ app }) => {
    await openWorkflowEditor(app);
    await app
      .locator(".react-flow__node-apStep")
      .first()
      .click({ button: "right" });
    await app.getByRole("button", { name: "Change trigger" }).click();
    await app
      .getByRole("button", { name: /^Manual/ })
      .first()
      .click();
    await expect(
      app.getByRole("button", { name: "Close panel" }),
    ).toBeVisible();
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
      await app
        .getByPlaceholder("Search pieces, actions, triggers…")
        .fill("HTTP");
      const row = app
        .getByRole("button")
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
