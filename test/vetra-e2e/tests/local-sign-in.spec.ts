import { expect, test } from "./helpers/fixtures.js";
import { freshSignInLink } from "./helpers/sign-in.js";
import { DESCRIBE_TIMEOUT } from "./helpers/timeouts.js";
import { waitForAppReady } from "./helpers/wait.js";

test.describe.configure({ timeout: DESCRIBE_TIMEOUT });

/*
 * Sign-in by link (F3d): `ph run vetra` keeps a secret in its owner-only run
 * record, and a link minted from it signs the tab in as this computer's
 * identity (the person's pseudonym, made at the first sign-in). The tab's
 * writes then name that identity, and its own session key as "connect".
 */

type Signer = {
  user?: { address?: string };
  app?: { name?: string; key?: string };
};

type TabPh = {
  renown?: { did: string; user?: { address: string; localIdentity?: string } };
  reactorClient?: {
    newDocument(type: string): Promise<unknown>;
    write: {
      create(
        document: unknown,
      ): Promise<{ documentId: string; written: Promise<unknown> }>;
    };
    getOperations(id: string): Promise<{
      results: { action: { type: string; context?: { signer?: Signer } } }[];
    }>;
  };
};

test("a sign-in link signs the tab in as this computer's identity, and its writes name it", async ({
  page,
}) => {
  await page.goto(freshSignInLink());
  await waitForAppReady(page);
  await page.waitForFunction(
    () =>
      (window as unknown as { ph?: TabPh }).ph?.renown?.user?.localIdentity ===
      "machine",
    undefined,
    { timeout: 60_000 },
  );
  // The code left the address bar before anything could replay it.
  expect(new URL(page.url()).hash).not.toContain("ph-sign-in");

  const written = await page.evaluate(async () => {
    const ph = (window as unknown as { ph: TabPh }).ph;
    const client = ph.reactorClient!;
    const handle = await client.write.create(
      await client.newDocument("powerhouse/document-model"),
    );
    await handle.written;
    const operations = await client.getOperations(handle.documentId);
    return {
      user: ph.renown!.user!.address,
      did: ph.renown!.did,
      signers: operations.results.map((op) => op.action.context?.signer),
    };
  });

  expect(written.signers.length).toBeGreaterThan(0);
  for (const signer of written.signers) {
    expect(signer?.user?.address?.toLowerCase()).toBe(
      written.user.toLowerCase(),
    );
    expect(signer?.app).toEqual({ name: "connect", key: written.did });
  }
});

test("a used link is refused, and the page says how to get a fresh one", async ({
  page,
}) => {
  const link = freshSignInLink();
  await page.goto(link);
  await page.waitForFunction(
    () =>
      (window as unknown as { ph?: TabPh }).ph?.renown?.user?.localIdentity ===
      "machine",
    undefined,
    { timeout: 60_000 },
  );

  // The same link again, in a fresh tab of another browser profile.
  const other = await page.context().browser()!.newContext();
  try {
    const second = await other.newPage();
    await second.goto(link);
    await expect(
      second.getByText("This sign-in link was used already."),
    ).toBeVisible({ timeout: 60_000 });
    await expect(
      second.getByText("it prints a fresh link", { exact: false }),
    ).toBeVisible();
  } finally {
    await other.close();
  }
});
