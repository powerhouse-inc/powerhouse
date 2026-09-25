import {
  canvasNode,
  openDrive,
  openWorkflowEditor,
} from "../../scripts/ui-stack.js";
import { expect, test } from "./fixtures.js";

test.describe("Run data", () => {
  test("a step's input and output read as trees, with references to copy", async ({
    app,
  }) => {
    await openDrive(app);
    await app.getByRole("row").filter({ hasText: "Link checker" }).click();
    await app
      .getByRole("list", { name: "Steps of this run" })
      .getByRole("button", { name: /Parse URL/ })
      .click();

    const received = app.getByRole("region", { name: "Received" });
    const produced = app.getByRole("region", { name: "Produced" });
    await expect(received).toContainText("https://acme.dev/docs?page=2");
    // Keys read as labels, and an empty string says so.
    await expect(produced).toContainText(/domain:\s*acme\.dev/);
    await expect(produced).toContainText(/hash:\s*empty/);

    // Each key offers the expression a later step would use to read it.
    const copy = produced.getByRole("button", {
      name: "Copy {{steps.parse.output.domain}}",
    });
    await expect(copy).toBeHidden();
    await produced.getByText("domain", { exact: true }).hover();
    await expect(copy).toBeVisible();

    await produced.getByRole("button", { name: "JSON", exact: true }).click();
    await expect(produced).toContainText('"domain": "acme.dev"');
    await produced.getByRole("button", { name: "Tree", exact: true }).click();
    await expect(produced).toContainText(/domain:\s*acme\.dev/);
  });

  test("a skipped step says the run never reached it", async ({ app }) => {
    await openDrive(app);
    await app.getByRole("row").filter({ hasText: "Uptime ping" }).click();
    await app
      .getByRole("list", { name: "Steps of this run" })
      .getByRole("button", { name: /Alert #ops/ })
      .click();
    await expect(
      app.getByText("The run never reached this step."),
    ).toBeVisible();
  });

  test("the step panel's Last run uses the same viewer", async ({ app }) => {
    await openWorkflowEditor(app, "Uptime ping");
    await canvasNode(app, "Ping host").click();
    await app.getByRole("tab", { name: /Last run/ }).click();
    await expect(app.getByRole("region", { name: "Received" })).toContainText(
      /url:\s*http:\/\/127\.0\.0\.1:9\/health/,
    );
    await expect(app.getByRole("region", { name: "Produced" })).toContainText(
      "Nothing",
    );
  });
});

test.describe("Connection picker", () => {
  test("offers only the connections in this drive", async ({ app }) => {
    // Every test seeds its own drive with an "Ops Slack" on one switchboard,
    // so an unscoped list would repeat it.
    await openWorkflowEditor(app, "Uptime ping");
    await canvasNode(app, "Alert #ops").click();
    const panel = app.locator("aside").filter({ has: app.getByRole("tab") });
    await panel.getByRole("button", { name: /Ops Slack/ }).click();
    await expect(panel.getByLabel("Search connections")).toBeFocused();
    await expect(panel.getByRole("button", { name: /Ops Slack/ })).toHaveCount(
      1,
    );
  });
});
