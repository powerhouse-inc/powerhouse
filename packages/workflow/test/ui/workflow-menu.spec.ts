import {
  coreTrigger,
  createWorkflowInBrowser,
  openDrive,
  selectInSidebar,
  shot,
  workflowState,
} from "../../scripts/ui-stack.js";
import { expect, test } from "./fixtures.js";

test.describe("Workflow menu", () => {
  test("Archive and Restore from the workflow page", async ({ stack, app }) => {
    await openDrive(app);
    await selectInSidebar(app, "Link checker");
    const main = app.getByRole("main");
    // The page shows publish state, not a second copy of the toggle.
    await expect(main.getByText("Published", { exact: true })).toBeVisible();
    await expect(main.getByRole("button", { name: "Delete" })).toHaveCount(0);

    await main
      .getByRole("button", { name: "More actions for Link checker" })
      .click();
    await app.getByRole("menuitem", { name: "Archive" }).click();
    await expect(main.getByText("Archived", { exact: true })).toBeVisible();
    await expect
      .poll(
        async () =>
          (await workflowState<{ status: string }>(app, stack.seeded.smoke))
            .status,
      )
      .toBe("ARCHIVED");

    await main
      .getByRole("button", { name: "More actions for Link checker" })
      .click();
    await app.getByRole("menuitem", { name: "Restore" }).click();
    await expect(main.getByText("Archived", { exact: true })).toBeHidden();
    // It was published, so it comes back switched off rather than a draft.
    await expect
      .poll(
        async () =>
          (await workflowState<{ status: string }>(app, stack.seeded.smoke))
            .status,
      )
      .toBe("DISABLED");
  });

  test("Delete asks for the exact name before it removes the workflow", async ({
    app,
  }) => {
    await openDrive(app);
    await selectInSidebar(app, "Link checker");
    const main = app.getByRole("main");
    await main
      .getByRole("button", { name: "More actions for Link checker" })
      .click();
    await app.getByRole("menuitem", { name: "Delete…" }).click();

    const dialog = app.getByRole("alertdialog", { name: "Delete workflow" });
    const confirm = dialog.getByRole("button", { name: "Delete workflow" });
    await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
    await expect(confirm).toBeDisabled();
    const name = dialog.getByRole("textbox");
    await name.fill("Link checke");
    await expect(confirm).toBeDisabled();
    await name.fill("link checker");
    await expect(confirm).toBeDisabled();
    await name.fill("Link checker");
    await expect(confirm).toBeEnabled();
    // Past the dialog's fade-in.
    await app.waitForTimeout(400);
    await shot(app, "delete-workflow-confirm");

    await confirm.click();
    await expect(dialog).toBeHidden();
    await expect(
      app
        .getByRole("complementary")
        .getByRole("button", { name: "Link checker", exact: true }),
    ).toHaveCount(0);
    await expect(
      app.getByRole("heading", { name: "Workflows", level: 2 }),
    ).toBeVisible();
  });

  test("the sidebar dot says what it means", async ({ stack, app }) => {
    await createWorkflowInBrowser(app, stack.drive, {
      name: "Unpublished",
      enabled: false,
      trigger: { ...(await coreTrigger("manual")), config: {} },
      steps: [],
    });
    await openDrive(app);
    const sidebar = app.getByRole("complementary");
    const dot = (name: string) =>
      sidebar.getByRole("button", { name, exact: true }).locator("[title]");
    await expect(dot("Uptime ping")).toHaveAttribute(
      "title",
      "Last run failed",
    );
    await expect(dot("Link checker")).toHaveAttribute(
      "title",
      "Last run succeeded",
    );
    await expect(dot("Daily digest")).toHaveAttribute("title", "Not run yet");
    await expect(dot("Unpublished")).toHaveAttribute(
      "title",
      "Not published yet",
    );
    await shot(app, "studio-sidebar-dots");
  });
});
