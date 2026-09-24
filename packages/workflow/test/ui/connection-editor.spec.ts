import { openDrive, selectInSidebar } from "../../scripts/ui-stack.js";
import { expect, test } from "./fixtures.js";

test.describe("Connection editor", () => {
  test.beforeEach(async ({ app }) => {
    await openDrive(app);
    await selectInSidebar(app, "Ops Slack");
    await app.getByRole("button", { name: "Edit connection" }).click();
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
});
