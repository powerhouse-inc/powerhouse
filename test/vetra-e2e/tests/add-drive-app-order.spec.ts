import { expect, test } from "./helpers/fixtures.js";
import { DESCRIBE_TIMEOUT } from "./helpers/timeouts.js";

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

// Asserts the Add Drive modal's app options after getCreateDriveAppOptions
// (apps/connect/src/utils/create-drive-app-options.ts): "vetra-drive-app" is
// hidden from the picker and GenericDriveExplorer ("Drive Explorer App") is
// sorted last so any other visible app becomes the pre-selected default.
//
// Assertion strategy, driven by ConnectSelect rendering (design-system
// `select.tsx`): the collapsed header shows the currently selected item; the
// expanded menu lists every item EXCEPT the selected one.
//
// This spec assumes exactly the two bundled apps are present (no local
// packages installed). With Vetra Drive App hidden, "Drive Explorer App" is
// the only option left, so it must be the pre-selected default and
// "Vetra Drive App" must never appear — collapsed or expanded.
test.describe.configure({ timeout: DESCRIBE_TIMEOUT });

test("should hide Vetra Drive App and default to Drive Explorer App in the Add Drive app options", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  // Open the Add Drive dialog.
  const createDriveButton = page.getByText("Create New Drive");
  await expect(createDriveButton).toBeVisible({ timeout: 10_000 });
  await createDriveButton.click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 10_000 });

  // Collapsed: "Drive Explorer App" is the default (visible in header).
  await expect(dialog.getByText("Drive Explorer App")).toBeVisible({
    timeout: 5_000,
  });

  // "Vetra Drive App" is hidden from the options entirely.
  await expect(dialog.getByText("Vetra Drive App")).toHaveCount(0);

  // Expand the select and confirm Vetra Drive App is not listed there either.
  await dialog.getByText("Drive Explorer App").click();
  await expect(dialog.getByText("Vetra Drive App")).toHaveCount(0);

  // Close without creating a drive — keep the environment clean.
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden", timeout: 5_000 });
});
