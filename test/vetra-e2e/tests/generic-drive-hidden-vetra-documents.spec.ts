import { expect, test } from "./helpers/fixtures.js";

// Pre-accept cookie banner so it doesn't block the test
test.use({
  storageState: {
    cookies: [],
    origins: [
      {
        origin: "http://localhost:3001",
        localStorage: [
          { name: "/:display-cookie-banner", value: "false" },
          {
            name: "/:acceptedCookies",
            value: '{"analytics":true,"marketing":false,"functional":false}',
          },
        ],
      },
    ],
  },
});

const HIDDEN_DISPLAY_NAMES = [
  "App Module",
  "Document Editor",
  "Processor Module",
  "Subgraph Module",
  "Vetra Package",
];

const VISIBLE_DISPLAY_NAME = "DocumentModel";

test("vetra document types are hidden in a generic drive", async ({ page }) => {
  // 1. Navigate to the home page
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  // 2. Create a new local drive "Generic Docs Drive"
  const createDriveButton = page.getByText("Create New Drive");
  await expect(createDriveButton).toBeVisible({ timeout: 10_000 });
  await createDriveButton.click();

  const addDriveDialog = page.getByRole("dialog");
  await expect(addDriveDialog).toBeVisible({ timeout: 10_000 });

  const driveNameInput = page.locator('input[placeholder="Drive name"]');
  await expect(driveNameInput).toBeVisible({ timeout: 5_000 });
  await driveNameInput.fill("Generic Docs Drive");

  const createDriveSubmit = page.getByRole("button", {
    name: "Create new drive",
  });
  await expect(createDriveSubmit).toBeEnabled({ timeout: 5_000 });
  await createDriveSubmit.click();

  // 3. Wait for navigation into the new drive
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(2_000);
  await expect(page).toHaveURL(/\/d\/[^/?]+/, { timeout: 10_000 });
  await page.waitForLoadState("networkidle");

  // 4. Locate the "New document" section
  await expect(
    page.getByRole("heading", { name: "New document" }),
  ).toBeVisible({ timeout: 30_000 });
  const section = page.locator(".flex.w-full.flex-wrap.gap-4");

  // 5. Positive control: DocumentModel must still be visible
  await expect(
    section.getByRole("button").filter({ hasText: VISIBLE_DISPLAY_NAME }),
  ).toBeVisible({ timeout: 30_000 });

  // 6. All five vetra builder-spec types must be absent
  for (const hiddenName of HIDDEN_DISPLAY_NAMES) {
    await expect(
      section.getByRole("button").filter({ hasText: hiddenName }),
    ).toHaveCount(0, { timeout: 30_000 });
  }
});
