import type { Page } from "@playwright/test";
import { canvasNode, openWorkflowEditor } from "../../scripts/ui-stack.js";
import { expect, test } from "./fixtures.js";

// Binds Summarise to a new OpenAI connection through the create modal.
async function createOpenAiConnection(app: Page) {
  await canvasNode(app, "Summarise").click();
  await expect(app.getByText("Connection needs a value")).toBeVisible();
  await app.getByRole("button", { name: "Choose a connection" }).click();
  await app.getByRole("button", { name: "Create connection" }).click();

  // The connection form opens in a modal over the editor.
  const dialog = app.getByRole("dialog", { name: "New connection" });
  await expect(
    dialog.getByRole("textbox", { name: "Connection name" }),
  ).toHaveValue("OpenAI connection");
  await dialog.getByPlaceholder("Paste the api key").fill("sk-test");
  await dialog.getByRole("button", { name: "Save API Key" }).click();
  await expect(dialog.getByText("Saved just now")).toBeVisible();
  await dialog.getByRole("button", { name: "Use this connection" }).click();
  await expect(dialog).toBeHidden();
}

// WCAG relative luminance of an sRGB colour, 0 (black) to 1 (white).
function luminance(r: number, g: number, b: number): number {
  const [lr, lg, lb] = [r, g, b].map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

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
      "Summarise {{steps.fetch.output.body}} in three bullets.",
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
    // The form a later step's expression resolves, from the run's scope root.
    await expect(app.getByText("{{steps.summarise.output.…}}")).toBeVisible();
    const next = app.locator("section", {
      has: app.getByRole("heading", { name: "What runs next" }),
    });
    await expect(next.getByText("Post to #ops", { exact: true })).toBeVisible();

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

  test("steps page through in run order", async ({ app }) => {
    await canvasNode(app, "Fetch metrics").click();
    await expect(app.getByText("1 of 3")).toBeVisible();
    await expect(
      app.getByRole("button", { name: "Previous step" }),
    ).toBeDisabled();
    await app.getByRole("button", { name: "Next step" }).click();
    await expect(app.getByRole("textbox", { name: "Step name" })).toHaveValue(
      "Summarise",
    );
    await expect(app.getByText("2 of 3")).toBeVisible();
  });

  test("the schedule builder speaks in days and times", async ({ app }) => {
    await canvasNode(app, "Schedule").click();
    await expect(app.getByRole("radio", { name: "Daily" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await expect(app.getByLabel("At", { exact: true })).toHaveValue("08:00");

    await app.getByRole("radio", { name: "Weekly" }).click();
    await app.getByRole("button", { name: "Wednesday" }).click();
    await expect(
      app.getByText("On Monday and Wednesday at 08:00 UTC", { exact: true }),
    ).toBeVisible();

    await app.getByRole("radio", { name: "Interval" }).click();
    await expect(app.getByLabel("Every", { exact: true })).toHaveValue("15");
    await expect(
      app.getByText("Every 15 minutes", { exact: true }),
    ).toBeVisible();
    // Cleared and retyped, not appended to what was there.
    const every = app.getByLabel("Every", { exact: true });
    await every.fill("");
    await every.pressSequentially("30");
    await expect(every).toHaveValue("30");
    await expect(
      app.getByText("Every 30 minutes", { exact: true }),
    ).toBeVisible();

    await app.getByRole("radio", { name: "Custom" }).click();
    const cron = app.getByLabel("Cron expression");
    await cron.fill("0 9 * * 1-5");
    // Custom stays open even when the cron spells a preset.
    await expect(app.getByRole("radio", { name: "Custom" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await expect(
      app.getByText("On weekdays at 09:00 UTC", { exact: true }),
    ).toBeVisible();
  });

  test("Insert data shows once its field is in play", async ({ app }) => {
    await canvasNode(app, "Summarise").click();
    const question = app.getByRole("textbox", { name: "Question" });
    const insert = app
      .locator(String.raw`div.group\/field`, { has: question })
      .getByRole("button", { name: "Insert data" });
    // Playwright counts opacity 0 as visible, so the reveal is read from CSS;
    // toHaveCSS retries until the fade has finished.
    await expect(insert).toHaveCSS("opacity", "0");
    await question.focus();
    await expect(insert).toHaveCSS("opacity", "1");
  });

  test("a missing connection can be created without leaving", async ({
    app,
  }) => {
    await createOpenAiConnection(app);
    // Bound by name once it has synced, never as a bare document id.
    const panel = app.locator("aside").filter({ has: app.getByRole("tab") });
    await expect(
      panel.getByRole("button", { name: /OpenAI connection/ }),
    ).toBeVisible();
    await expect(
      app.getByText("Not a known connection document."),
    ).toBeHidden();
    await expect(app.getByText("Connection needs a value")).toBeHidden();
    await expect(app.getByText("Ready to run")).toBeVisible();
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
    // An opaque, dark fill: rgba(0, 0, 0, 0) would show whatever is beneath.
    const [r0, g0, b0, alpha = 1] = background.match(/[\d.]+/g)!.map(Number);
    expect(alpha).toBe(1);
    expect(luminance(r0, g0, b0)).toBeLessThan(0.1);
    const name = app.getByRole("textbox", { name: "Step name" });
    const color = await name.evaluate(
      (element) => getComputedStyle(element).color,
    );
    // Light text on the dark surface, so the name stays readable.
    const [r, g, b] = color.match(/\d+/g)!.map(Number);
    expect(luminance(r, g, b)).toBeGreaterThan(0.7);

    // Logos keep their size inside the white tile that backs them.
    const logo = canvasNode(app, "Summarise").getByRole("img", {
      name: "Ask ChatGPT",
    });
    await expect(logo).toBeVisible();
    const box = await logo.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(24);
    expect(box!.height).toBeGreaterThanOrEqual(24);
  });
});

test.describe("Editor header", () => {
  test("Back returns to the workflow and undo reverts an edit", async ({
    app,
  }) => {
    await openWorkflowEditor(app);
    await canvasNode(app, "Summarise").click();
    const name = app.getByRole("textbox", { name: "Step name" });
    await name.fill("Summarise metrics");
    await name.press("Enter");
    await expect(canvasNode(app, "Summarise metrics")).toBeVisible();
    await app.getByRole("button", { name: "Undo" }).click();
    await expect(canvasNode(app, "Summarise metrics")).toBeHidden();
    await expect(canvasNode(app, "Summarise")).toBeVisible();

    await app.getByRole("button", { name: "Back" }).click();
    await expect(
      app.getByRole("heading", { name: "Daily digest" }),
    ).toBeVisible();
  });
});

test.describe("Step panel after a run", () => {
  test("Last run shows what the step received and why it failed", async ({
    app,
  }) => {
    await openWorkflowEditor(app, "Uptime ping");
    await canvasNode(app, "Ping host").click();
    await app.getByRole("tab", { name: /Last run/ }).click();
    await expect(app.getByText("Failed", { exact: true })).toBeVisible();
    await expect(app.getByText("TypeError: fetch failed")).toBeVisible();
    await expect(app.getByRole("region", { name: "Received" })).toContainText(
      "http://127.0.0.1:9/health",
    );

    // A step the run never reached says so.
    await app.getByRole("button", { name: "Next step" }).click();
    await app.getByRole("tab", { name: /Last run/ }).click();
    await expect(app.getByText("Skipped", { exact: true })).toBeVisible();
  });
});
