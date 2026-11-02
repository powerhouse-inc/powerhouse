// The manual trigger's inputs: authored on the trigger, asked for by Run, and
// offered to later steps as typed trigger.payload paths.
import type { Page } from "@playwright/test";
import {
  canvasNode,
  coreAction,
  coreTrigger,
  createWorkflowInBrowser,
  gql,
  openDrive,
  openWorkflowEditor,
  selectInSidebar,
  shot,
  waitServed,
  workflowState,
} from "../../scripts/ui-stack.js";
import { expect, test } from "./fixtures.js";

// Every test adds the documents it needs.
test.use({ seed: false });

const INPUTS = [
  { displayName: "Email", name: "email", type: "text", required: true },
  { displayName: "Count", name: "count", type: "number", required: false },
  {
    displayName: "Priority",
    name: "priority",
    type: "dropdown",
    options: "low\nhigh",
    required: false,
  },
];

async function runPayloads(workflowId: string): Promise<unknown[]> {
  const data = await gql<{
    workflowRuntime: { runs: { triggerPayload: unknown }[] };
  }>(
    "/graphql/workflow-runtime",
    `query($w: String) { workflowRuntime { runs(workflowId: $w) { triggerPayload } } }`,
    { w: workflowId },
  );
  return data.workflowRuntime.runs.map((run) => run.triggerPayload);
}

// A published manual workflow, served by the switchboard, open in the studio.
async function openManualWorkflow(
  app: Page,
  drive: string,
  name: string,
  config: Record<string, unknown>,
): Promise<string> {
  const id = await createWorkflowInBrowser(app, drive, {
    name,
    trigger: { ...(await coreTrigger("manual")), config },
    steps: [],
  });
  await waitServed(id, "trigger");
  await openDrive(app);
  await selectInSidebar(app, name);
  await expect(app.getByText("No runs yet")).toBeVisible();
  return id;
}

test.describe("Run dialog", () => {
  test("Run asks for the inputs and fires with a typed payload", async ({
    stack,
    app,
  }) => {
    const id = await openManualWorkflow(app, stack.drive, "Ask first", {
      inputs: INPUTS,
    });
    await app.getByRole("button", { name: "Run now" }).click();
    const dialog = app.getByRole("dialog", { name: "Run workflow" });
    await expect(dialog).toBeVisible();

    await dialog.getByRole("textbox", { name: /^Email/ }).fill("ada@acme.dev");
    await dialog.getByRole("textbox", { name: /^Count/ }).fill("3");
    await dialog.getByRole("combobox", { name: /^Priority/ }).click();
    await app.getByRole("option", { name: "high", exact: true }).click();
    await shot(app, "run-dialog-filled");
    await dialog.getByRole("button", { name: "Run", exact: true }).click();
    await expect(dialog).toBeHidden();

    // The number arrives as a number, not the text typed into the field.
    await expect
      .poll(() => runPayloads(id))
      .toEqual([{ email: "ada@acme.dev", count: 3, priority: "high" }]);
    await expect(app.getByText("No runs yet")).toBeHidden();
  });

  test("a required input left empty is refused before anything fires", async ({
    stack,
    app,
  }) => {
    const id = await openManualWorkflow(app, stack.drive, "Needs an email", {
      inputs: INPUTS,
    });
    await app.getByRole("button", { name: "Run now" }).click();
    const dialog = app.getByRole("dialog", { name: "Run workflow" });
    await dialog.getByRole("textbox", { name: /^Count/ }).fill("3");
    await dialog.getByRole("button", { name: "Run", exact: true }).click();

    await expect(dialog.getByRole("alert")).toContainText("Email is required");
    await expect(dialog).toBeVisible();
    await shot(app, "run-dialog-required");
    expect(await runPayloads(id)).toEqual([]);
    await expect(app.getByText("No runs yet")).toBeVisible();
  });

  test("a workflow without inputs fires straight away", async ({
    stack,
    app,
  }) => {
    const id = await openManualWorkflow(app, stack.drive, "Just run", {});
    await app.getByRole("button", { name: "Run now" }).click();
    await expect.poll(async () => (await runPayloads(id)).length).toBe(1);
    await expect(app.getByRole("dialog", { name: "Run workflow" })).toHaveCount(
      0,
    );
  });
});

interface TriggerState {
  trigger: { config: { inputs?: Record<string, unknown>[] } };
}

test.describe("Manual trigger inputs", () => {
  test("an input added on the trigger is offered to later steps with its type", async ({
    stack,
    app,
  }) => {
    const id = await createWorkflowInBrowser(app, stack.drive, {
      name: "Typed inputs",
      enabled: false,
      trigger: { ...(await coreTrigger("manual")), config: {} },
      steps: [
        {
          key: "check",
          name: "Check input",
          ...(await coreAction("assert")),
          config: { value: "ok" },
        },
      ],
    });
    await openWorkflowEditor(app, "Typed inputs");
    await canvasNode(app, "Manual").click();
    // A trigger's panel has no tabs; it is the aside that removes the trigger.
    const panel = app
      .locator("aside")
      .filter({ has: app.getByRole("button", { name: "Remove trigger" }) });

    await panel.getByRole("button", { name: "Add input" }).click();
    const type = panel.getByRole("combobox", { name: /Field Type/ });
    await expect(type).toContainText("Text");
    // Options are only asked for by a dropdown.
    const options = panel.getByRole("textbox", { name: /^Options/ });
    await expect(options).toHaveCount(0);

    await panel.getByRole("textbox", { name: /^Field Name/ }).fill("Priority");
    const key = panel.getByRole("textbox", { name: /^Payload Key/ });
    await key.fill("priority");
    await key.blur();
    await type.click();
    await app.getByRole("option", { name: "Dropdown", exact: true }).click();
    await expect(options).toBeVisible();
    await options.fill("low\nhigh");
    await options.blur();
    await shot(app, "manual-trigger-inputs");
    await expect
      .poll(
        async () =>
          (await workflowState<TriggerState>(app, id)).trigger.config.inputs,
      )
      .toEqual([
        expect.objectContaining({
          displayName: "Priority",
          name: "priority",
          type: "dropdown",
          options: "low\nhigh",
        }),
      ]);

    // A later step's picker reads the input's declared type.
    await app.getByRole("button", { name: "Close panel" }).click();
    await canvasNode(app, "Check input").click();
    const value = app.getByRole("textbox", { name: /^Value/ });
    await value.focus();
    await app
      .locator(String.raw`div.group\/field`, { has: value })
      .getByRole("button", { name: "Insert data" })
      .click();
    const popup = app.locator(".workflow-expression-popup");
    await popup.getByPlaceholder("Search paths…").fill("trigger.payload");
    await expect(
      popup.getByRole("button", {
        name: /trigger\.payload\.priority\s*String$/,
      }),
    ).toBeVisible();
    await shot(app, "manual-trigger-inputs-picker");
  });
});
