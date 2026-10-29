import { expect, test, type Page } from "@playwright/test";
import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";
import { privateKeyToAccount } from "viem/accounts";
import { RENOWN_APP_NAME } from "../src/lib/renown";
import { FAKE_RENOWN_URL, SWITCHBOARD_URL } from "../playwright.config";

// Redirect sign-in e2e, against the redirect-mode dev server (playwright.config,
// project "redirect"). The Renown portal is a fake origin: the route below does
// what renown.id does for a returning user - sign a delegation credential for
// the app's key, store it on the switchboard, and send the browser back to the
// app with `?user=<did>`.

// The well-known Anvil test account #0, as in the in-page sign-in spec.
const ANVIL_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const account = privateKeyToAccount(ANVIL_KEY);
const CHAIN_ID = 1;
// `RENOWN_SESSION_COOKIE` from @renown/sdk/node. Specs load as CommonJS, which
// the SDK's dependencies do not support, so the SDK stays out of this file.
const SESSION_COOKIE = "renown_session";

/** Signs and stores the credential in a separate ESM process
 * (./support/issue-credential.mjs); resolves the user's DID. */
async function issueCredential(appDid: string): Promise<string> {
  const { stdout } = await promisify(execFile)(process.execPath, [
    join(__dirname, "support", "issue-credential.mjs"),
    SWITCHBOARD_URL,
    RENOWN_APP_NAME,
    appDid,
    ANVIL_KEY,
    String(CHAIN_ID),
  ]);
  return stdout.trim();
}

type RenownVisit = { appDid: string; returnUrl: URL };

/**
 * Plays renown.id. `returnTo` picks where the user is sent back: the app's
 * own `returnUrl` by default, or another path of the app.
 */
async function fakeRenownPortal(
  page: Page,
  returnTo?: (visit: RenownVisit) => URL,
): Promise<RenownVisit[]> {
  const visits: RenownVisit[] = [];
  await page.route(`${FAKE_RENOWN_URL}/**`, async (route) => {
    const url = new URL(route.request().url());
    const appDid = url.searchParams.get("connect") ?? "";
    const returnUrl = new URL(url.searchParams.get("returnUrl") ?? "");
    const visit = { appDid, returnUrl };
    visits.push(visit);

    const userDid = await issueCredential(appDid);

    const back = returnTo ? returnTo(visit) : new URL(returnUrl);
    back.searchParams.set("user", userDid);
    await route.fulfill({ status: 302, headers: { location: back.href } });
  });
  return visits;
}

async function expectSignedIn(page: Page) {
  await page.waitForURL((url) => url.pathname === "/", { timeout: 30_000 });
  await expect(page.getByText("Signed in as")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(new RegExp(account.address, "i"))).toBeVisible();
  // The DID was consumed: a reload must not sign in from the URL again.
  expect(new URL(page.url()).searchParams.has("user")).toBe(false);
  // The session cookie is written, so the proxy and the server side see it.
  const cookies = await page.context().cookies();
  expect(cookies.some((c) => c.name === SESSION_COOKIE)).toBe(true);
}

test("offers only the Renown redirect, no wallet methods", async ({ page }) => {
  await page.goto("/login");
  await expect(
    page.getByRole("button", { name: "Continue with Renown" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Connect a Wallet" }),
  ).toHaveCount(0);
});

test("completes a redirect sign-in round trip", async ({ page }) => {
  const visits = await fakeRenownPortal(page);
  await page.goto("/login");
  await page.getByRole("button", { name: "Continue with Renown" }).click();

  await expectSignedIn(page);

  // The portal was asked to send the user back to the page that started the
  // sign-in, without a stale `user` param.
  expect(visits).toHaveLength(1);
  expect(visits[0].appDid).toMatch(/^did:key:/);
  expect(visits[0].returnUrl.pathname).toBe("/login");
  expect(visits[0].returnUrl.searchParams.has("user")).toBe(false);
});

test("keeps the DID when the return lands on a protected path", async ({
  page,
}) => {
  // Send the user back to `/` instead of `/login`: the proxy redirects an
  // unauthenticated visitor to /login and must carry `?user=` along.
  await fakeRenownPortal(page, ({ returnUrl }) => new URL("/", returnUrl));
  await page.goto("/login");
  await page.getByRole("button", { name: "Continue with Renown" }).click();

  await expectSignedIn(page);
});
