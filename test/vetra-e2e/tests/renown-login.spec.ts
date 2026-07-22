import { expect, test } from "./helpers/fixtures.js";
import { DESCRIBE_TIMEOUT } from "./helpers/timeouts.js";
import { waitForAppReady } from "./helpers/wait.js";

test.describe.configure({ timeout: DESCRIBE_TIMEOUT });

// Connect's Renown login surface: the app is configured with rainbow + privy
// adapters (powerhouse.config.json), so the modal renders the derived methods.
test("sidebar login opens the Renown modal with the configured methods", async ({
  page,
}) => {
  // Dismiss the cookie banner so it can't intercept the login click.
  await page.addInitScript(() => {
    window.localStorage.setItem("/:display-cookie-banner", "false");
  });

  await page.goto("/");
  await waitForAppReady(page);

  // Sidebar Renown login trigger (shown while signed out).
  await page.locator('button[aria-label="Log in"]').click();

  // Methods derived from connect.renown.adapters via useRenownLoginMethods.
  await expect(
    page.getByRole("button", { name: "Connect a Wallet" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Continue with Google" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Continue with Email" }),
  ).toBeVisible();
});
