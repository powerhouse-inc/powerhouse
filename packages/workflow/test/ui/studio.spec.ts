import { openDrive, selectInSidebar } from "../../scripts/ui-stack.js";
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
    await expect(ping).toContainText("When started by hand");
    await expect(ping).toContainText("Failed");
    await expect(ping.getByRole("list").first()).toHaveAccessibleName(
      /Ping host: failed.*Alert #ops/,
    );
    await expect(
      app.getByText("3 workflows, 3 enabled, 1 failed on the last run"),
    ).toBeVisible();

    await ping.getByRole("button").click();
    await expect(
      app.getByRole("heading", { name: "Uptime ping" }),
    ).toBeVisible();
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
    await expect(steps.nth(0)).toContainText("Started by hand");
    await expect(steps.nth(1)).toContainText("Succeeded");
    await expect(steps.nth(2)).toContainText("Failed");
    await expect(steps.nth(3)).toContainText("Skipped");
    await expect(steps.nth(2)).toContainText("Send HTTP request");

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
    await expect(app.getByText("Ask ChatGPT")).toBeVisible();
    await expect(app.getByText("Send Message To A Channel")).toBeVisible();
  });

  test("a connection names its service and the workflows using it", async ({
    app,
  }) => {
    await openDrive(app);
    await selectInSidebar(app, "Ops Slack");
    await expect(app.getByText("Connected", { exact: true })).toBeVisible();
    await expect(app.getByText("Keys and tokens")).toBeVisible();
    await expect(app.getByText("2 workflows")).toBeVisible();
    const usedBy = app.locator("section", {
      has: app.getByRole("heading", { name: "Used by" }),
    });
    await expect(usedBy.getByRole("button")).toHaveText([
      /Daily digest/,
      /Uptime ping/,
    ]);
  });
});
