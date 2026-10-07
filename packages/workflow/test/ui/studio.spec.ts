import {
  coreTrigger,
  createWorkflowInBrowser,
  openDrive,
  pieceAction,
  selectInSidebar,
} from "../../scripts/ui-stack.js";
import { expect, test } from "./fixtures.js";

test.describe("Workflow Studio", () => {
  test("the overview shows each workflow's trigger, chain and last run", async ({
    app,
  }) => {
    await openDrive(app);
    const board = app.getByRole("list", { name: "Workflows" });
    const digest = board
      .getByRole("listitem")
      .filter({ hasText: "Daily digest" });
    await expect(digest).toContainText("Every day at 08:00 UTC");
    await expect(digest).toContainText("Not run yet");
    const ping = board.getByRole("listitem").filter({ hasText: "Uptime ping" });
    await expect(ping).toContainText("Manual");
    await expect(ping).toContainText("Failed");
    await expect(ping.getByRole("list")).toHaveAccessibleName(
      /Ping host: failed.*Alert #ops/,
    );
    await expect(
      app.getByText("4 workflows, 4 enabled, 1 failed on the last run"),
    ).toBeVisible();

    // The header folds the row; its content opens the workflow.
    await ping.getByRole("button", { name: "Open Uptime ping" }).click();
    await expect(
      app.getByRole("heading", { name: "Uptime ping" }),
    ).toBeVisible();
  });

  test("a workflow folds to its title line, and stays folded", async ({
    app,
  }) => {
    await openDrive(app);
    const row = () =>
      app
        .getByRole("list", { name: "Workflows" })
        .locator(":scope > li", { hasText: "Uptime ping" });
    // Expanded, the graph names each step under its circle.
    const stepName = () => row().getByText("Ping host", { exact: true });
    await expect(stepName()).toBeVisible();

    // Folded, the title line carries the trigger and a chain of step logos.
    await row().getByRole("button", { name: "Collapse Uptime ping" }).click();
    await expect(stepName()).toHaveCount(0);
    await expect(row().getByText("Manual", { exact: true })).toBeVisible();
    await expect(row().getByRole("list")).toHaveAccessibleName(
      /Ping host: failed/,
    );

    await app.reload();
    await expect(
      row().getByRole("button", { name: "Expand Uptime ping" }),
    ).toHaveAttribute("aria-expanded", "false");
    await row().getByRole("button", { name: "Expand Uptime ping" }).click();
    await expect(stepName()).toBeVisible();
  });

  test("lists every run in the drive with its outcome", async ({ app }) => {
    await openDrive(app);
    const rows = app.getByRole("row");
    await expect(rows.filter({ hasText: "Uptime ping" })).toContainText(
      "Failed",
    );
    await expect(rows.filter({ hasText: "Link checker" })).toContainText(
      "Succeeded",
    );
    await expect(app.getByText("2 of 2 runs")).toBeVisible();
  });

  test("run details show the trigger first, then each step", async ({
    app,
  }) => {
    await openDrive(app);
    await selectInSidebar(app, "Uptime ping");
    await app.getByRole("row").filter({ hasText: "Failed" }).click();

    const steps = app
      .getByRole("list", { name: "Steps of this run" })
      .getByRole("listitem");
    await expect(steps).toHaveCount(4);
    await expect(steps.nth(0)).toContainText("Fired");
    await expect(steps.nth(0)).toContainText("Manual");
    await expect(steps.nth(1)).toContainText("Succeeded");
    await expect(steps.nth(1)).toContainText("Parse URL");
    await expect(steps.nth(2)).toContainText("Failed");
    await expect(steps.nth(2)).toContainText("Ping host");
    await expect(steps.nth(3)).toContainText("Skipped");
    await expect(steps.nth(2)).toContainText("Send HTTP request");
    // Steps read by name, and each timed step shows how long it took.
    await expect(app.getByText("Ping host failed: TypeError")).toBeVisible();
    await expect(steps.nth(1)).toContainText(/\d+ms|\d+\.\ds|\d+m \d+s/);
    await expect(steps.nth(3)).toContainText("–");

    // The trigger row opens onto the payload the run started with.
    await steps.nth(0).getByRole("button").click();
    await expect(steps.nth(0)).toContainText("status.acme.dev/health");
  });

  test("the step track shows how far the latest run got", async ({ app }) => {
    await openDrive(app);
    await selectInSidebar(app, "Uptime ping");
    await expect(app.getByText("Coloured by the latest run")).toBeVisible();
    await expect(
      app.getByRole("button", { name: "Parse URL: succeeded" }),
    ).toBeVisible();
    await expect(
      app.getByRole("button", { name: "Ping host: failed" }),
    ).toBeVisible();
    await expect(
      app.getByRole("button", { name: "Alert #ops: skipped" }),
    ).toBeVisible();
  });

  test("a workflow that never ran says so", async ({ app }) => {
    await openDrive(app);
    await selectInSidebar(app, "Daily digest");
    await expect(app.getByText("Not run yet")).toBeVisible();
    await expect(app.getByText("No runs yet")).toBeVisible();
    await expect(
      app.getByRole("button", { name: "Summarise: not run" }),
    ).toBeVisible();
    // Actions read by the piece's own names, not their ids.
    await app.getByRole("button", { name: "Summarise: not run" }).hover();
    await expect(app.getByRole("tooltip")).toContainText("Ask ChatGPT");
    await app.getByRole("button", { name: "Post to #ops: not run" }).hover();
    await expect(app.getByRole("tooltip")).toContainText(
      "Send Message To A Channel",
    );
  });

  test("picking a connection opens its editor", async ({ app }) => {
    await openDrive(app);
    await selectInSidebar(app, "Ops Slack");
    await expect(
      app.getByRole("textbox", { name: "Connection name" }),
    ).toHaveValue("Ops Slack");
    const usedBy = app.locator("section", {
      has: app.getByRole("heading", { name: "Used by" }),
    });
    await expect(usedBy.getByRole("button")).toHaveText([
      /Daily digest.*Post to #ops/,
      /Order router.*Ask for approval.*Alert #ops/,
      /Uptime ping.*Alert #ops/,
    ]);
    await app.getByRole("button", { name: "Back" }).click();
    await expect(
      app.getByRole("heading", { name: "Workflows", level: 2 }),
    ).toBeVisible();
  });

  test("a long workflow's graph shows every step on its own row", async ({
    stack,
  }) => {
    const parse = await pieceAction("@activepieces/piece-http", "parse_url");
    await createWorkflowInBrowser(stack.page, stack.drive, {
      name: "Long chain",
      trigger: { ...(await coreTrigger("manual")), config: {} },
      steps: Array.from({ length: 8 }, (_, i) => ({
        key: `step${i + 1}`,
        name: `Step ${i + 1}`,
        ...parse,
        config: { url: "https://acme.dev" },
      })),
    });
    await openDrive(stack.page);
    const row = stack.page
      .getByRole("list", { name: "Workflows" })
      .locator(":scope > li")
      .filter({ hasText: "Long chain" });
    const graph = row.getByRole("list").first();
    await expect(graph).toHaveAccessibleName(/^Step 1.*Step 8$/);
    await expect(graph.getByRole("listitem")).toHaveCount(8);
    // The trigger pill reads as the trigger, and the graph sits below the name.
    await expect(row.getByText("Manual", { exact: true })).toBeVisible();
    const name = await row.getByText("Long chain").boundingBox();
    const box = await graph.boundingBox();
    expect(box!.y).toBeGreaterThan(name!.y + name!.height);
  });

  test("a description set in the editor shows on the overview", async ({
    app,
  }) => {
    await openDrive(app);
    await selectInSidebar(app, "Link checker");
    await app.getByRole("button", { name: "Edit workflow" }).click();
    const input = app.getByRole("textbox", { name: "Workflow description" });
    await input.fill("Checks every link on the site");
    await input.press("Enter");

    await app.getByRole("button", { name: "Overview" }).click();
    const row = app
      .getByRole("list", { name: "Workflows" })
      .locator(":scope > li", { hasText: "Link checker" });
    await expect(row.getByText("Checks every link on the site")).toBeVisible();
  });
});
