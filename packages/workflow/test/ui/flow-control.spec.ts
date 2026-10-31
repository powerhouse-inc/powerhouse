// The core router's ports follow its branches, named on the canvas; the core
// loop draws its body under "For each item" and what follows under "After loop".
import {
  canvasNode,
  coreAction,
  coreTrigger,
  createWorkflowInBrowser,
  openWorkflowEditor,
  shot,
  workflowState,
} from "../../scripts/ui-stack.js";
import { expect, test } from "./fixtures.js";

// Every test adds the documents it needs.
test.use({ seed: false });

interface RouterState {
  steps: { key: string; config: { branches?: unknown[] } }[];
}

test.describe("Flow control", () => {
  test("a router's branches are its ports, named on the canvas", async ({
    stack,
    app,
  }) => {
    const id = await createWorkflowInBrowser(app, stack.drive, {
      name: "Routing",
      enabled: false,
      trigger: { ...(await coreTrigger("manual")), config: {} },
      steps: [
        {
          key: "route",
          name: "Route order",
          ...(await coreAction("router")),
          config: {
            branches: [
              {
                name: "Paid",
                left: "{{trigger.payload.status}}",
                operator: "TEXT_EXACTLY_MATCHES",
                right: "paid",
              },
            ],
          },
        },
        {
          key: "charge",
          name: "Charge",
          ...(await coreAction("assert")),
          config: { value: "ok" },
        },
      ],
      edges: [
        { from: "trigger", to: "route", port: "next" },
        { from: "route", to: "charge", port: "branch_1" },
      ],
    });
    await openWorkflowEditor(app, "Routing");
    await expect(app.getByText("Paid", { exact: true })).toBeVisible();
    await expect(
      app.getByRole("button", { name: "Add step (Otherwise)" }),
    ).toBeVisible();
    await expect(app.getByText("never taken")).toHaveCount(0);

    await canvasNode(app, "Route order").click();
    await app.getByRole("button", { name: "Add branch" }).click();
    await expect(
      app.getByRole("button", { name: "Add step (Branch 2)" }),
    ).toBeVisible();
    await expect
      .poll(async () => {
        const state = await workflowState<RouterState>(app, id);
        return state.steps[0].config.branches?.length;
      })
      .toBe(2);
    await shot(app, "router-branches");
  });

  test("a loop draws its body and what follows it side by side", async ({
    stack,
    app,
  }) => {
    await createWorkflowInBrowser(app, stack.drive, {
      name: "Looping",
      enabled: false,
      trigger: { ...(await coreTrigger("manual")), config: {} },
      steps: [
        {
          key: "loop",
          name: "Each row",
          ...(await coreAction("loop")),
          config: { items: "{{trigger.payload.rows}}" },
        },
        {
          key: "check",
          name: "Check row",
          ...(await coreAction("assert")),
          config: { value: "{{steps.loop.output.item}}" },
        },
        {
          key: "done",
          name: "Done",
          ...(await coreAction("assert")),
          config: { value: "{{steps.loop.output.count}}" },
        },
      ],
      edges: [
        { from: "trigger", to: "loop", port: "next" },
        { from: "loop", to: "check", port: "each" },
        { from: "loop", to: "done", port: "next" },
      ],
    });
    await openWorkflowEditor(app, "Looping");
    await expect(app.getByText("For each item", { exact: true })).toBeVisible();
    await expect(app.getByText("After loop", { exact: true })).toBeVisible();
    const body = await canvasNode(app, "Check row").boundingBox();
    const after = await canvasNode(app, "Done").boundingBox();
    expect(body!.x).toBeLessThan(after!.x);
    await shot(app, "loop-columns");
  });
});
