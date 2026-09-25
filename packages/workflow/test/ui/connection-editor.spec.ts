import { openDrive, selectInSidebar } from "../../scripts/ui-stack.js";
import { expect, test } from "./fixtures.js";

test.describe("Connection editor", () => {
  test.beforeEach(async ({ app }) => {
    await openDrive(app);
    await selectInSidebar(app, "Ops Slack");
  });

  test("shows the service and its readable status", async ({ app }) => {
    await expect(app.getByText("Connected", { exact: true })).toBeVisible();
    await expect(
      app.getByRole("combobox").filter({ hasText: "Slack" }),
    ).toBeVisible();
    await expect(app.getByText("Bot Token", { exact: true })).toBeVisible();
    await expect(
      app.getByText("User Token", { exact: true }).locator(".."),
    ).toContainText("Optional");
  });

  test("the service list is searchable", async ({ app }) => {
    await app.getByRole("combobox").filter({ hasText: "Slack" }).click();
    const search = app.getByPlaceholder("Search");
    await expect(search).toBeFocused();
    await search.fill("github");
    const options = app.getByRole("listbox").getByRole("option");
    await expect(options.first()).toContainText("GitHub");
    await search.fill("zzzz-no-such-piece");
    await expect(app.getByText("Nothing matches.")).toBeVisible();
    await search.press("Escape");
    await expect(app.getByRole("listbox")).toBeHidden();
    await expect(
      app.getByRole("combobox").filter({ hasText: "Slack" }),
    ).toBeVisible();
  });

  test("a saved token shows as saved, and Replace rotates it", async ({
    app,
  }) => {
    const saved = app.getByText(/^Saved (just now|\d+[mh] ago)$/);
    await expect(saved).toBeVisible();
    await expect(app.getByPlaceholder("Paste the bot token")).toBeHidden();

    await app.getByRole("button", { name: "Replace" }).click();
    const input = app.getByPlaceholder("Paste the new bot token");
    await expect(input).toBeFocused();
    await input.press("Escape");
    await expect(input).toBeHidden();

    await app.getByRole("button", { name: "Replace" }).click();
    await input.fill("xoxb-rotated");
    await expect(input).toHaveAttribute("type", "password");
    await app.getByRole("button", { name: "Show Bot Token" }).click();
    await expect(input).toHaveAttribute("type", "text");
    await app.getByRole("button", { name: "Save Bot Token" }).click();
    await expect(app.getByText("Saved just now")).toBeVisible();
    await expect(input).toBeHidden();
  });

  test("pasting an optional token saves it", async ({ app }) => {
    const save = app.getByRole("button", { name: "Save User Token" });
    await expect(save).toBeDisabled();
    await app.getByPlaceholder("Paste the user token").fill("xoxp-user");
    await save.press("Enter");
    await expect(app.getByPlaceholder("Paste the user token")).toBeHidden();
    // The User Token's own field: its label plus a saved card, not Bot Token's.
    const userToken = app
      .locator("div")
      .filter({ has: app.getByText("User Token", { exact: true }) })
      .filter({ has: app.getByRole("button", { name: "Replace" }) })
      .filter({ hasNot: app.getByText("Bot Token", { exact: true }) });
    await expect(userToken.getByText("Saved just now")).toBeVisible();
  });

  test("the reference sits behind a disclosure", async ({ app }) => {
    await expect(app.getByLabel("Secret reference")).toBeHidden();
    const botToken = app
      .locator("div")
      .filter({ has: app.getByText("Bot Token", { exact: true }) })
      .filter({ has: app.getByRole("button", { name: "Replace" }) })
      .filter({ hasNot: app.getByText("User Token", { exact: true }) });
    await botToken.getByRole("button", { name: "Reference" }).click();
    await expect(app.getByLabel("Secret reference")).toHaveValue(
      /^secret:\/\/v1:/,
    );
  });

  test("Revoke warns about dependents and Reactivate undoes it", async ({
    app,
  }) => {
    const testButton = app.getByRole("button", { name: "Test connection" });
    const revoke = app.getByRole("button", { name: "Revoke", exact: true });
    await expect(revoke).toHaveAttribute(
      "title",
      "2 enabled workflows stop working while it's revoked",
    );
    await revoke.click();
    await expect(app.getByText("Revoked", { exact: true })).toBeVisible();
    await expect(testButton).toBeDisabled();

    await app.getByRole("button", { name: "Reactivate" }).click();
    await expect(app.getByText("Connected", { exact: true })).toBeVisible();
    await expect(testButton).toBeEnabled();
    await expect(revoke).toHaveAttribute("title", /2 enabled workflows/);
  });

  test("Test connection runs the check and says how it went", async ({
    app,
  }) => {
    await app.getByRole("button", { name: "Test connection" }).click();
    await expect(app.getByRole("status")).toContainText(
      "It works, signed in as ops@acme.dev",
    );
    await expect(app.getByText("Last checked just now")).toBeVisible();
  });
});
