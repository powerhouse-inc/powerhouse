// The core branch is drawn from the descriptor the reactor serves: an explicit
// operator, and a second operand only where the operator reads one.
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

interface BranchState {
  steps: { key: string; config: Record<string, unknown> }[];
}

test.describe("Branch", () => {
  test("picks an operator and shows the operand it compares with", async ({
    stack,
    app,
  }) => {
    const id = await createWorkflowInBrowser(app, stack.drive, {
      name: "Branching",
      enabled: false,
      trigger: { ...(await coreTrigger("manual")), config: {} },
      steps: [
        {
          key: "check",
          name: "Check total",
          ...(await coreAction("branch")),
          config: {
            left: "{{trigger.payload.total}}",
            operator: "TEXT_EXACTLY_MATCHES",
            right: "10",
          },
        },
      ],
    });
    await openWorkflowEditor(app, "Branching");
    await canvasNode(app, "Check total").click();

    const operator = app.getByRole("combobox", { name: /Condition/ });
    await expect(operator).toContainText("Text is exactly");
    await expect(
      app.getByRole("textbox", { name: /Compared with/ }),
    ).toBeVisible();
    await expect(
      app.getByText("Case sensitive", { exact: true }),
    ).toBeVisible();

    await operator.click();
    await app.getByRole("option", { name: "Number is greater than" }).click();
    await expect(operator).toContainText("Number is greater than");
    // Case only means something for text.
    await expect(app.getByText("Case sensitive", { exact: true })).toHaveCount(
      0,
    );
    await expect
      .poll(async () => {
        const state = await workflowState<BranchState>(app, id);
        return state.steps[0].config.operator;
      })
      .toBe("NUMBER_IS_GREATER_THAN");
    await shot(app, "branch-operator-form");

    await operator.click();
    await app.getByRole("option", { name: "Exists", exact: true }).click();
    await expect(
      app.getByRole("textbox", { name: /Compared with/ }),
    ).toHaveCount(0);
  });
});
