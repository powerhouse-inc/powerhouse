import { openDrive, selectInSidebar } from "../../scripts/ui-stack.js";
import { expect, test } from "./fixtures.js";

test.describe("Workflow Studio", () => {
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
  });

  test("a connection names its service and the workflows using it", async ({
    app,
  }) => {
    await openDrive(app);
    await selectInSidebar(app, "Ops Slack");
    await expect(app.getByText("Connected", { exact: true })).toBeVisible();
    await expect(app.getByText("OAuth 2")).toBeVisible();
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
