import { expect, test } from "@playwright/test";

// Renown in-page sign-in e2e. The dev server runs the mock wallet adapter
// (NEXT_PUBLIC_RENOWN_MOCK=1) against the local switchboard (playwright.config).

// The mock adapter signs with the well-known Anvil test account #0.
const MOCK_ADDRESS = "0xf39Fd6e51aaD88F6F4ce6aB8827279cffFb92266";

test("renders the configured Renown login methods", async ({ page }) => {
  await page.goto("/login");

  const card = page.getByText("Sign in with Renown");
  await expect(card).toBeVisible();

  // Methods derived from the adapters config via useRenownLoginMethods.
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

test("redirects an unauthenticated visitor to /login", async ({ page }) => {
  await page.goto("/");
  await page.waitForURL("**/login");
  await expect(page.getByText("Sign in with Renown")).toBeVisible();
});

test("completes wallet sign-in end-to-end against the switchboard", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Connect a Wallet" }).click();

  // The mock signs a real EIP-712 credential, the switchboard stores the
  // credential + user documents, login resolves, and the app leaves /login.
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
    timeout: 30_000,
  });
  await expect(page.getByText("Signed in as")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();

  // The resolved account is the mock signer's address (casing-agnostic).
  await expect(page.getByText(new RegExp(MOCK_ADDRESS, "i"))).toBeVisible();
});
