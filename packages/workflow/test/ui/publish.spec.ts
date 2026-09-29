import type { Page } from "@playwright/test";
import {
  canvasNode,
  coreTrigger,
  createWorkflowInBrowser,
  openWorkflowEditor,
  pieceAction,
  type PhWindow,
} from "../../scripts/ui-stack.js";
import { expect, test } from "./fixtures.js";

const STEP = "Create connection";

interface DocState {
  status: string;
  version: number;
  published: { version: number } | null;
  steps: {
    name: string;
    config: Record<string, unknown>;
    skip: boolean | null;
    propertySettings: { prop: string; mode: string; schema: unknown }[] | null;
  }[];
}

async function docState(app: Page, id: string): Promise<DocState> {
  return app.evaluate(async (workflowId) => {
    const client = (window as unknown as PhWindow).ph!.reactorClientModule!
      .client;
    const document = (await client.get(workflowId)) as {
      state: { global: DocState };
    };
    return document.state.global;
  }, id);
}

// A reactor Create document step with its action type chosen, so only the
// Input fields the model declares are left to fill.
async function createDocumentWorkflow(
  app: Page,
  drive: string,
  name: string,
  options: { enabled?: boolean } = {},
) {
  return createWorkflowInBrowser(app, drive, {
    name,
    enabled: options.enabled,
    trigger: { ...(await coreTrigger("manual")), config: {} },
    steps: [
      {
        key: "create",
        name: STEP,
        ...(await pieceAction(
          "@powerhousedao/piece-reactor",
          "document-create",
        )),
        config: {
          documentType: "powerhouse/connection",
          actionType: "SET_CONNECTOR",
        },
      },
    ],
  });
}

// Fills the Input fields SET_CONNECTOR declares.
async function fillInput(app: Page) {
  const connector = app.getByRole("textbox", { name: /Connector id/ });
  await connector.fill("@acme/piece#x");
  await connector.blur();
  await app.getByRole("combobox", { name: /Auth type/ }).click();
  await app.getByRole("option", { name: /Custom auth/ }).click();
}

const incomplete = (app: Page) =>
  canvasNode(app, STEP).getByText("Incomplete", { exact: true });

const inputSchema = async (app: Page, id: string) =>
  (await docState(app, id)).steps[0].propertySettings?.find(
    (setting) => setting.prop === "input",
  )?.schema;

// The editor's header row, which the name field sits in.
const headerOf = (app: Page) =>
  app.getByRole("textbox", { name: "Workflow name" }).locator("..");

test.describe("Computed validity and publishing", () => {
  test("the badge turns Incomplete, then clears as Input is filled", async ({
    stack,
    app,
  }) => {
    const id = await createDocumentWorkflow(app, stack.drive, "Badge check");
    await openWorkflowEditor(app, "Badge check");
    await canvasNode(app, STEP).click();
    await expect(incomplete(app)).toBeVisible();
    await expect(
      app.getByRole("textbox", { name: /Connector id/ }),
    ).toBeVisible();
    // Resolving the Input fields writes nothing.
    expect(await inputSchema(app, id)).toBeUndefined();

    await fillInput(app);
    await expect(incomplete(app)).toBeHidden();
    await expect(app.getByText("Ready to run")).toBeVisible();
    // The edit carries the resolved fields, options stripped, for the runtime.
    await expect
      .poll(() => inputSchema(app, id))
      .toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "connectorId" }),
        ]),
      );
  });

  test("Publish holds for an unopened incomplete step, and undo and redo move it", async ({
    stack,
    app,
  }) => {
    const id = await createDocumentWorkflow(app, stack.drive, "Gate me", {
      enabled: false,
    });
    const seeded = (await docState(app, id)).version;
    await openWorkflowEditor(app, "Gate me");
    const header = headerOf(app);
    const publish = header.getByRole("button", {
      name: "Publish",
      exact: true,
    });
    // The canvas checks the step without its panel open.
    await expect(incomplete(app)).toBeVisible();
    await expect(publish).toBeDisabled();
    // Loading forms and resolving fields writes nothing to the document.
    expect(await docState(app, id)).not.toHaveProperty("valid");
    expect((await docState(app, id)).version).toBe(seeded);

    await canvasNode(app, STEP).click();
    await fillInput(app);
    await expect(publish).toBeEnabled();
    // The panel's field hides the shortcut; the canvas takes it.
    await app.getByRole("button", { name: "Close panel" }).click();

    await app.keyboard.press("ControlOrMeta+z");
    await expect
      .poll(async () => (await docState(app, id)).steps[0].config.input)
      .not.toHaveProperty("authType");
    await expect(publish).toBeDisabled();
    await expect(incomplete(app)).toBeVisible();

    await app.keyboard.press("ControlOrMeta+Shift+z");
    await expect
      .poll(async () => (await docState(app, id)).steps[0].config.input)
      .toHaveProperty("authType");
    await expect(publish).toBeEnabled();
    await expect(incomplete(app)).toBeHidden();
  });

  test("Publish waits for the steps, then publishes and turns the workflow on", async ({
    stack,
    app,
  }) => {
    const id = await createDocumentWorkflow(app, stack.drive, "Publish me", {
      enabled: false,
    });
    await openWorkflowEditor(app, "Publish me");
    const header = headerOf(app);
    const publish = header.getByRole("button", {
      name: "Publish",
      exact: true,
    });
    await expect(header.getByText("Draft", { exact: true })).toBeVisible();
    // The banner's Show opens the first incomplete step.
    const banner = app.getByRole("status").filter({
      hasText: "You have unpublished changes",
    });
    await expect(
      banner.getByText("Incomplete steps", { exact: true }),
    ).toBeVisible();
    await banner.getByRole("button", { name: "Show", exact: true }).click();
    await expect(app.getByRole("textbox", { name: "Step name" })).toHaveValue(
      STEP,
    );
    await app.getByRole("button", { name: "Close panel" }).click();
    // Off until published.
    const toggle = header.getByRole("switch", { name: /Turn the workflow on/ });
    await expect(toggle).toBeDisabled();
    await toggle.locator("..").hover();
    await expect(app.getByText("Publish the workflow first")).toBeVisible();

    await expect(publish).toBeDisabled();
    // A disabled button takes no pointer; its wrapper shows the tooltip.
    await publish.locator("..").hover();
    const tip = app.getByRole("button", { name: "You have incomplete steps" });
    await expect(tip).toBeVisible();
    // The tooltip leads to the step that needs work.
    await tip.click();
    await expect(app.getByRole("textbox", { name: "Step name" })).toHaveValue(
      STEP,
    );

    await fillInput(app);
    await expect(publish).toBeEnabled();
    await publish.click();
    await expect(header.getByText("Published", { exact: true })).toBeVisible();
    await expect(app.getByText("You have unpublished changes")).toBeHidden();
    const state = await docState(app, id);
    expect(state.status).toBe("ENABLED");
    expect(state.published?.version).toBe(state.version);
    await expect(
      header.getByRole("switch", { name: /Turn the workflow off/ }),
    ).toBeEnabled();
  });

  test("Discard changes goes back to what was published", async ({
    stack,
    app,
  }) => {
    const id = await createDocumentWorkflow(app, stack.drive, "Discard me");
    await openWorkflowEditor(app, "Discard me");
    await canvasNode(app, STEP).click();
    await fillInput(app);
    const banner = app.getByRole("status").filter({
      hasText: "You have unpublished changes",
    });
    await banner.getByRole("button", { name: "Publish", exact: true }).click();
    await expect(banner).toBeHidden();

    const name = app.getByRole("textbox", { name: "Step name" });
    await name.fill("Renamed step");
    await name.press("Enter");
    await expect(canvasNode(app, "Renamed step")).toBeVisible();
    await expect(banner).toBeVisible();
    await banner.getByRole("button", { name: "Discard changes" }).click();
    await expect(canvasNode(app, STEP)).toBeVisible();
    await expect(banner).toBeHidden();
    const state = await docState(app, id);
    expect(state.steps[0].name).toBe(STEP);
    expect(state.version).toBe(state.published?.version);
  });

  test("a skipped step is dimmed and tagged", async ({ stack, app }) => {
    const id = await createDocumentWorkflow(app, stack.drive, "Skip me");
    await openWorkflowEditor(app, "Skip me");
    await canvasNode(app, STEP).click({ button: "right" });
    await app.getByRole("button", { name: "Skip this step" }).click();
    const node = canvasNode(app, STEP);
    await expect(node.getByText("Skipped", { exact: true })).toBeVisible();
    // Skipped steps don't count against the workflow.
    await expect(incomplete(app)).toBeHidden();
    await expect
      .poll(async () => (await docState(app, id)).steps[0].skip)
      .toBe(true);

    // The Settings tab carries the same switch.
    await node.click();
    await app.getByRole("tab", { name: /Settings/ }).click();
    const skip = app.getByRole("switch", { name: "Skip this step" });
    await expect(skip).toHaveAttribute("aria-checked", "true");
    await skip.click();
    await expect(node.getByText("Skipped", { exact: true })).toBeHidden();
  });

  test("undo and redo step across a form load", async ({ stack, app }) => {
    const id = await createDocumentWorkflow(app, stack.drive, "Undo me");
    await openWorkflowEditor(app, "Undo me");
    await canvasNode(app, STEP).click();
    await expect(incomplete(app)).toBeVisible();

    // A real edit whose new Input form then loads.
    const action = app.getByRole("region", { name: "Action" });
    await action.getByRole("combobox", { name: /Type/ }).click();
    await app.getByPlaceholder("Search").fill("SET_CONNECTION_NAME");
    await app.getByRole("option", { name: /SET_CONNECTION_NAME/ }).click();
    await expect(app.getByRole("textbox", { name: /^Name/ })).toBeVisible();
    const actionType = async () =>
      (await docState(app, id)).steps[0].config.actionType;
    await expect.poll(actionType).toBe("SET_CONNECTION_NAME");

    await app.keyboard.press("ControlOrMeta+z");
    await expect.poll(actionType).toBe("SET_CONNECTOR");
    await expect(
      app.getByRole("textbox", { name: /Connector id/ }),
    ).toBeVisible();
    await app.keyboard.press("ControlOrMeta+Shift+z");
    await expect.poll(actionType).toBe("SET_CONNECTION_NAME");
  });
});
