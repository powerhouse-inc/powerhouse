import {
  canvasNode,
  coreTrigger,
  createWorkflowInBrowser,
  fireAndWait,
  openDrive,
  openWorkflowEditor,
  pieceAction,
  shot,
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

  test("a long value wraps beside its key and offers its text to copy", async ({
    stack,
    app,
  }) => {
    const url = `https://acme.dev/${"segment/".repeat(40)}end`;
    const id = await createWorkflowInBrowser(app, stack.drive, {
      name: "Long values",
      trigger: { ...(await coreTrigger("manual")), config: {} },
      steps: [
        {
          key: "parse",
          name: "Parse long URL",
          ...(await pieceAction("@activepieces/piece-http", "parse_url")),
          config: { url },
        },
      ],
    });
    await fireAndWait(id);
    await openDrive(app);
    await app.getByRole("row").filter({ hasText: "Long values" }).click();
    await app
      .getByRole("list", { name: "Steps of this run" })
      .getByRole("button", { name: /Parse long URL/ })
      .click();

    const received = app.getByRole("region", { name: "Received" });
    const copy = received.getByRole("button", { name: "Copy value" });
    await expect(copy).toBeHidden();
    // Shown shortened; the copy button carries the full value.
    const value = received.getByText(url.slice(0, 60));
    await value.hover();
    await expect(copy).toBeVisible();
    await shot(app, "data-viewer-long-value");

    // Wrapped, the value stays inside the viewer and its key stays in view.
    const region = (await received.boundingBox())!;
    const key = (await received
      .getByText("url", { exact: true })
      .boundingBox())!;
    const text = (await value.boundingBox())!;
    expect(key.x).toBeGreaterThanOrEqual(region.x);
    expect(key.x + key.width).toBeLessThanOrEqual(region.x + region.width);
    expect(text.x + text.width).toBeLessThanOrEqual(
      region.x + region.width + 1,
    );
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
