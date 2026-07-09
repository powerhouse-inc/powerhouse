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

// In studio mode both bundled apps are offered; getCreateDriveAppOptions ranks
// the generic explorer before vetra, so Drive Explorer App is default and last.
test.describe.configure({ timeout: DESCRIBE_TIMEOUT });

test("should default to Drive Explorer App and list Vetra Drive App last", async ({
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

  // Collapsed: "Drive Explorer App" is the default (visible in the header).
  await expect(dialog.getByText("Drive Explorer App")).toBeVisible({
    timeout: 5_000,
  });

  // ConnectSelect hides non-selected items until expanded, so click to reveal
  // "Vetra Drive App" — the other (last) option.
  await dialog.getByText("Drive Explorer App").click();
  await expect(dialog.getByText("Vetra Drive App")).toBeVisible({
    timeout: 5_000,
  });

  // Close without creating a drive — keep the environment clean.
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden", timeout: 5_000 });
});
