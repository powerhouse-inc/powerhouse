// Ports come from each block's descriptor: the canvas draws only those, and
// an edge on any other is an error on its step, not a silent dead end.
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

interface Graph {
  steps: { id: string; key: string; pieceName: string; actionName: string }[];
  edges: { id: string; from: string; to: string; port: string }[];
}

test.describe("Declared ports", () => {
  test("an edge on a port the branch never takes is flagged and can be removed", async ({
    stack,
    app,
  }) => {
    // Chained on "next", which the core branch does not declare.
    const id = await createWorkflowInBrowser(app, stack.drive, {
      name: "Dead port",
      enabled: false,
      trigger: { ...(await coreTrigger("manual")), config: {} },
      steps: [
        {
          key: "check",
          name: "Check",
          ...(await coreAction("branch")),
          config: { left: "x", operator: "EXISTS" },
        },
        {
          key: "after",
          name: "After",
          ...(await coreAction("assert")),
          config: { value: "ok" },
        },
      ],
    });
    await openWorkflowEditor(app, "Dead port");
    const branch = canvasNode(app, "Check");
    await expect(branch.getByText("Miswired", { exact: true })).toBeVisible();
    await expect(app.getByText("next · never taken")).toBeVisible();

    await branch.click();
    await expect(
      app.getByText('An edge leaves on "next", which this block never takes'),
    ).toBeVisible();
    await shot(app, "dead-port-error");

    await app.getByRole("tab", { name: "Settings" }).click();
    await expect(app.getByText("Never taken", { exact: true })).toBeVisible();
    await app
      .locator("div", { has: app.getByText("Never taken", { exact: true }) })
      .getByRole("button", { name: "Disconnect" })
      .last()
      .click();
    await expect(branch.getByText("Miswired", { exact: true })).toHaveCount(0);
    await expect
      .poll(async () => {
        const state = await workflowState<Graph>(app, id);
        return state.edges.filter((edge) => edge.from === "check").length;
      })
      .toBe(0);
  });

  test("a branch inserted on an edge continues on true, not next", async ({
    stack,
    app,
  }) => {
    const id = await createWorkflowInBrowser(app, stack.drive, {
      name: "Insert branch",
      enabled: false,
      trigger: { ...(await coreTrigger("manual")), config: {} },
      steps: [
        {
          key: "after",
          name: "After",
          ...(await coreAction("assert")),
          config: { value: "ok" },
        },
      ],
    });
    await openWorkflowEditor(app, "Insert branch");
    // The edge's own add button, drawn mid-line.
    await app.locator(".react-flow__edgelabel-renderer button").first().click();
    await app.getByRole("button", { name: "Core", exact: true }).click();
    await app
      .getByRole("button")
      .filter({ hasText: "Routes true/false" })
      .click();

    await expect
      .poll(async () => {
        const state = await workflowState<Graph>(app, id);
        const branch = state.steps.find(
          (step) =>
            step.pieceName === "@powerhousedao/piece-core" &&
            step.actionName === "branch",
        );
        return state.edges
          .filter((edge) => edge.from === branch?.id)
          .map((edge) => `${edge.port}->${edge.to}`);
      })
      .toEqual(["true->after"]);
    await expect(app.getByText("never taken")).toHaveCount(0);
  });
});
