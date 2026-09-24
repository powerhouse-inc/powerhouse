import { canvasNode, openWorkflowEditor } from "../../scripts/ui-stack.js";
import { expect, test } from "./fixtures.js";

test.describe("Step panel", () => {
  test.beforeEach(async ({ app }) => {
    await openWorkflowEditor(app);
  });

  test("opens on Setup and names what the step still needs", async ({
    app,
  }) => {
    await canvasNode(app, "Summarise").click();
    await expect(app.getByRole("tab", { name: "Setup" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(app.getByText("Connection needs a value")).toBeVisible();
    await expect(app.getByText("OpenAI · Ask ChatGPT")).toBeVisible();
    await expect(app.getByRole("textbox", { name: /Question/ })).toHaveValue(
      "Summarise {{fetch.body}} in three bullets.",
    );
    // Optional fields say so rather than flagging every required one.
    await expect(
      app.getByText("Temperature", { exact: true }).locator(".."),
    ).toContainText("Optional");
  });

  test("a step with nothing missing reads as ready", async ({ app }) => {
    await canvasNode(app, "Fetch metrics").click();
    await expect(app.getByText("Ready to run")).toBeVisible();
  });

  test("renaming in the header renames the node on the canvas", async ({
    app,
  }) => {
    await canvasNode(app, "Summarise").click();
    const name = app.getByRole("textbox", { name: "Step name" });
    await name.fill("Summarise metrics");
    await name.press("Enter");
    await expect(canvasNode(app, "Summarise metrics")).toBeVisible();
  });

  test("Settings holds the key, the flow and error routing", async ({
    app,
  }) => {
    await canvasNode(app, "Summarise").click();
    await app.getByRole("tab", { name: "Settings" }).click();
    await expect(
      app.getByRole("textbox", { name: "Key", exact: true }),
    ).toHaveValue("summarise");
    await expect(app.getByText("Post to #ops").last()).toBeVisible();

    // Route errors with the keyboard alone: open, pick, confirm.
    const onError = app
      .getByRole("combobox")
      .filter({ hasText: "Fail the run" });
    await onError.focus();
    await onError.press("Enter");
    const listbox = app.getByRole("listbox");
    await expect(listbox.getByRole("option")).toHaveText(["Post to #ops"]);
    await app.keyboard.press("Enter");
    await expect(listbox).toBeHidden();

    const failures = app.locator("section", {
      has: app.getByRole("heading", { name: "When it fails" }),
    });
    await expect(failures.getByText("Post to #ops")).toBeVisible();
    // The Settings tab counts what's been customised.
    await expect(
      app.getByRole("tab", { name: /^Settings\s*1$/ }),
    ).toBeVisible();

    await failures.getByRole("button", { name: "Disconnect" }).click();
    await expect(failures.getByText("Post to #ops")).toBeHidden();
    await expect(
      app.getByRole("tab", { name: "Settings", exact: true }),
    ).toBeVisible();
  });

  test("Escape closes a list without changing the value", async ({ app }) => {
    await app.getByRole("combobox").filter({ hasText: "Enabled" }).click();
    const listbox = app.getByRole("listbox");
    await expect(listbox.getByRole("option")).toHaveCount(4);
    await app.keyboard.press("ArrowDown");
    await app.keyboard.press("Escape");
    await expect(listbox).toBeHidden();
    await expect(
      app.getByRole("combobox").filter({ hasText: "Enabled" }),
    ).toBeVisible();
  });

  test("the schedule trigger shows only the fields for its mode", async ({
    app,
  }) => {
    await canvasNode(app, "Schedule").click();
    await expect(app.getByText("Ready to run")).toBeVisible();
    await expect(
      app.getByText("Cron expression", { exact: true }),
    ).toBeVisible();
    await expect(app.getByText("Every", { exact: true })).toBeHidden();

    await app.getByRole("radio", { name: "At a fixed interval" }).click();
    await expect(app.getByText("Every", { exact: true })).toBeVisible();
    await expect(
      app.getByText("Cron expression", { exact: true }),
    ).toBeHidden();
    await expect(app.getByText("Every needs a value")).toBeVisible();
  });
});

test.describe("Step panel in dark mode", () => {
  test.use({ theme: "dark" });

  test("the panel draws on the dark surface", async ({ app }) => {
    await openWorkflowEditor(app);
    await canvasNode(app, "Summarise").click();
    const panel = app.locator("aside").filter({ has: app.getByRole("tab") });
    const background = await panel.evaluate(
      (element) => getComputedStyle(element).backgroundColor,
    );
    expect(background).not.toBe("rgb(255, 255, 255)");
    const name = app.getByRole("textbox", { name: "Step name" });
    const color = await name.evaluate(
      (element) => getComputedStyle(element).color,
    );
    // Light text on the dark surface, so the name stays readable.
    const [r, g, b] = color.match(/\d+/g)!.map(Number);
    expect(r + g + b).toBeGreaterThan(600);
  });
});
