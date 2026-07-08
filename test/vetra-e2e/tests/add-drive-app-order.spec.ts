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

// Asserts that the Add Drive modal's app select puts GenericDriveExplorer
// ("Drive Explorer App") last so any other app becomes the pre-selected default.
//
// Assertion strategy, driven by ConnectSelect rendering (design-system
// `select.tsx`): the collapsed header shows the currently selected item; the
// expanded menu lists every item EXCEPT the selected one. Items hidden in the
// collapsed state use `max-h-0` + `overflow-hidden`, which Playwright treats as
// hidden, so `toBeHidden()`/`toBeVisible()` around the click is the order proof.
//
// This spec assumes exactly the two bundled apps are present (no local
// packages installed). With that constraint, default = [first in collapsed
// header] and "Drive Explorer App" shown only after expand proves it is last.
test.describe.configure({ timeout: DESCRIBE_TIMEOUT });

test("should show Drive Explorer App last in the Add Drive app options", async ({
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

  // Collapsed: "Vetra Drive App" is the default (visible in header).
  await expect(dialog.getByText("Vetra Drive App")).toBeVisible({
    timeout: 5_000,
  });

  // Click to expand the select.
  await dialog.getByText("Vetra Drive App").click();

  // After expand: "Drive Explorer App" is now visible — it is the last option
  // (not removed, just was hidden while selected).
  await expect(dialog.getByText("Drive Explorer App")).toBeVisible({
    timeout: 5_000,
  });

  // Close without creating a drive — keep the environment clean.
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden", timeout: 5_000 });
});
