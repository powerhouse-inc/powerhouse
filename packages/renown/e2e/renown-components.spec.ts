import { expect, test } from "@playwright/test";

test.describe("Renown SDK Components", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("page loads correctly", async ({ page }) => {
    await expect(page.locator("h1")).toContainText("Renown SDK Components");
  });

  test.describe("RenownLoginButton", () => {
    test("renders login button with direct login (default)", async ({
      page,
    }) => {
      const section = page.locator('[data-testid="login-button-section"]');
      await expect(section).toBeVisible();

      // Default button has "Login with Renown" aria-label (direct login mode)
      const directLoginButton = section.locator(
        'button[aria-label="Login with Renown"]',
      );
      await expect(directLoginButton.first()).toBeVisible();
    });

    test("renders login button with popover option", async ({ page }) => {
      const popoverContainer = page.locator('[data-testid="popover-login"]');
      await expect(popoverContainer).toBeVisible();

      // Popover button has "Open Renown Login" aria-label
      const popoverButton = popoverContainer.locator(
        'button[aria-label="Open Renown Login"]',
      );
      await expect(popoverButton).toBeVisible();
    });

    test("opens popover on hover when showPopover is true", async ({
      page,
    }) => {
      const popoverContainer = page.locator('[data-testid="popover-login"]');
      const button = popoverContainer.locator(
        'button[aria-label="Open Renown Login"]',
      );

      // Hover the button
      await button.hover();

      // Check that the popover is visible with "Connect" text
      await expect(page.getByRole("button", { name: "Connect" })).toBeVisible();
    });

    test("closes popover when clicking outside", async ({ page }) => {
      const popoverContainer = page.locator('[data-testid="popover-login"]');
      const button = popoverContainer.locator(
        'button[aria-label="Open Renown Login"]',
      );

      // Open popover
      await button.hover();
      await expect(page.getByRole("button", { name: "Connect" })).toBeVisible();

      // Click outside
      await page.locator("h1").click();

      // Popover should be hidden
      await expect(
        page.getByRole("button", { name: "Connect" }),
      ).not.toBeVisible();
    });

    test("renders with custom trigger", async ({ page }) => {
      const section = page.locator('[data-testid="login-button-section"]');
      const signInButton = section.getByRole("button", { name: "Sign In" });
      await expect(signInButton).toBeVisible();
    });

    test("renders dark mode with inverted image and dark popover", async ({
      page,
    }) => {
      const darkModeContainer = page.locator('[data-testid="dark-mode-login"]');
      await expect(darkModeContainer).toBeVisible();

      // Check that the trigger image has invert filter
      const triggerImage = darkModeContainer.locator('img[alt="Renown Login"]');
      await expect(triggerImage).toBeVisible();
      await expect(triggerImage).toHaveCSS("filter", "invert(1)");

      // Open the popover by hovering
      const button = darkModeContainer.locator(
        'button[aria-label="Open Renown Login"]',
      );
      await button.hover();

      // Check that the popover has dark background
      const connectButton = page
        .getByRole("button", { name: "Connect" })
        .last();
      await expect(connectButton).toBeVisible();

      // Check that the Connect button has light text color for dark mode
      await expect(connectButton).toHaveCSS("color", "rgb(249, 250, 251)");
    });
  });

  test.describe("RenownUserButton", () => {
    test("renders user buttons", async ({ page }) => {
      const section = page.locator('[data-testid="user-button-section"]');
      await expect(section).toBeVisible();

      // Check that user buttons are visible (they have "Open account menu" aria-label)
      const buttons = section.locator('button[aria-label="Open account menu"]');
      await expect(buttons).toHaveCount(3);
    });

    test("opens popover with user info on click", async ({ page }) => {
      const section = page.locator('[data-testid="user-button-section"]');
      const button = section
        .locator('button[aria-label="Open account menu"]')
        .first();

      // Click the button
      await button.click();

      // Check that the popover is visible with user info
      await expect(page.getByText("vitalik.eth")).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Disconnect" }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "View on Renown" }),
      ).toBeVisible();
    });

    test("shows truncated address in popover", async ({ page }) => {
      const section = page.locator('[data-testid="user-button-section"]');
      const button = section
        .locator('button[aria-label="Open account menu"]')
        .first();

      await button.click();

      // Address should be truncated (0x12345...45678)
      await expect(page.getByText("0x12345...45678")).toBeVisible();
    });

    test("can copy address to clipboard", async ({ page, context }) => {
      // Grant clipboard permissions
      await context.grantPermissions(["clipboard-read", "clipboard-write"]);

      const section = page.locator('[data-testid="user-button-section"]');
      const button = section
        .locator('button[aria-label="Open account menu"]')
        .first();

      await button.click();

      // Click the address button to copy
      const addressButton = page.getByText("0x12345...45678");
      await addressButton.click();

      // Check that "Copied to clipboard!" text appears (with opacity transition)
      await expect(page.getByText("Copied to clipboard!")).toBeVisible();

      // After 2 seconds, the address should be visible again
      await page.waitForTimeout(2100);
      await expect(page.getByText("0x12345...45678")).toBeVisible();
    });

    test("closes popover when clicking outside", async ({ page }) => {
      const section = page.locator('[data-testid="user-button-section"]');
      const button = section
        .locator('button[aria-label="Open account menu"]')
        .first();

      // Open popover
      await button.click();
      await expect(
        page.getByRole("button", { name: "Disconnect" }),
      ).toBeVisible();

      // Click outside
      await page.locator("h1").click();

      // Popover should be hidden
      await expect(
        page.getByRole("button", { name: "Disconnect" }),
      ).not.toBeVisible();
    });

    test("shows placeholder avatar when no avatarUrl provided", async ({
      page,
    }) => {
      const section = page.locator('[data-testid="user-button-section"]');

      // First button has no avatar - check for placeholder
      const firstRow = section.locator('[style*="background"]').first();
      await expect(firstRow).toBeVisible();
    });

    test("shows image avatar when avatarUrl provided", async ({ page }) => {
      const section = page.locator('[data-testid="user-button-section"]');

      // Second button has an avatar image
      const avatarImg = section.locator('img[alt="Avatar"]');
      await expect(avatarImg).toHaveCount(1);
    });
  });

  test.describe("RenownAuthButton", () => {
    test("renders auth button section", async ({ page }) => {
      const section = page.locator('[data-testid="auth-button-section"]');
      await expect(section).toBeVisible();
    });

    test("shows login button when not authenticated", async ({ page }) => {
      const section = page.locator('[data-testid="auth-button-section"]');

      // Wait for initialization to complete
      await page.waitForTimeout(2000);

      // Should show a login button since we're not authenticated
      // RenownAuthButton uses direct login mode (no popover) by default
      const loginButton = section.locator(
        'button[aria-label="Login with Renown"]',
      );
      await expect(loginButton).toBeVisible({ timeout: 10000 });
    });
  });
});
