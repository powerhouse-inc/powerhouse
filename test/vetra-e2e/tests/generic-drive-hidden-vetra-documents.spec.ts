import { expect, test } from "./helpers/fixtures.js";
import { waitForAppReady } from "./helpers/wait.js";

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

// DocumentModel and the vetra builder-spec types are authored via their own
// drives, so none are creatable from a generic drive.
const HIDDEN_DISPLAY_NAMES = [
  "DocumentModel",
  "App Module",
  "Document Editor",
  "Processor Module",
  "Subgraph Module",
  "Vetra Package",
];

test("vetra document types are hidden in a generic drive", async ({ page }) => {
  // 1. Navigate to the home page
  await page.goto("/");
  await waitForAppReady(page);

  // 2. Create a new local drive "Generic Docs Drive"
  const createDriveButton = page.getByText("Create New Drive");
  await expect(createDriveButton).toBeVisible({ timeout: 10_000 });
  await createDriveButton.click();

  const addDriveDialog = page.getByRole("dialog");
  await expect(addDriveDialog).toBeVisible({ timeout: 10_000 });

  // "Drive Explorer App" is the pre-selected default (vetra is ranked last),
  // so the created drive uses the generic explorer.
  await expect(addDriveDialog.getByText("Drive Explorer App")).toBeVisible({
    timeout: 5_000,
  });

  const driveNameInput = page.locator('input[placeholder="Drive name"]');
  await expect(driveNameInput).toBeVisible({ timeout: 5_000 });
  await driveNameInput.fill("Generic Docs Drive");

  const createDriveSubmit = page.getByRole("button", {
    name: "Create new drive",
  });
  await expect(createDriveSubmit).toBeEnabled({ timeout: 5_000 });
  await createDriveSubmit.click();

  // 3. Wait for navigation into the new drive
  await waitForAppReady(page);
  await page.waitForTimeout(2_000);
  await expect(page).toHaveURL(/\/d\/[^/?]+/, { timeout: 10_000 });
  await waitForAppReady(page);

  // 4. Positive control: the "Create New Document" button renders.
  // NOTE: this positive control depends on document-creation.spec.ts having
  // run first (workers: 1, alphabetical file order): it generates a creatable
  // project-local document model. With zero creatable types the footer
  // deliberately renders nothing (see create-document.tsx), and this spec
  // would fail here if run in isolation.
  const createDocumentButton = page.getByRole("button", {
    name: "Create New Document",
  });
  await expect(createDocumentButton).toBeVisible({ timeout: 30_000 });
  await createDocumentButton.click();

  // 5. DocumentModel + every vetra builder-spec type must be absent from the
  // document-type select. ConnectSelect keeps its options in the DOM even
  // while collapsed, so presence is checked without opening the menu.
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByText("Select document type…", { exact: true }),
  ).toBeVisible({ timeout: 10_000 });
  for (const hiddenName of HIDDEN_DISPLAY_NAMES) {
    const escaped = hiddenName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    await expect(
      dialog.getByText(new RegExp(`^${escaped}( v\\d+)?$`)),
    ).toHaveCount(0, { timeout: 30_000 });
  }
});
