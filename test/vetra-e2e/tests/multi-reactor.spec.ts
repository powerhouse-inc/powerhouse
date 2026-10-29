// Connect routed to the Vetra switchboard (4002) by a rewritten served config.

import type { Page } from "@playwright/test";
import { expect, test } from "./helpers/fixtures.js";
import { DESCRIBE_TIMEOUT, LONG_VISIBLE_TIMEOUT } from "./helpers/timeouts.js";
import { waitForAppReady } from "./helpers/wait.js";

const SWITCHBOARD = "http://localhost:4002";
const GRAPHQL = `${SWITCHBOARD}/graphql/r`;
const REACTOR_CLIENT_STORAGE_KEY = "ph:reactorClient";

type RoutingRow = { collectionId: string; backend: string; origin?: string };

type PhWindow = {
  ph?: {
    drives?: Array<{
      header: { id: string };
      state: { global: { nodes: Array<{ name: string }> } };
    }>;
    fullReactorClient?: {
      describeRouting(): { backends: string[]; collections: RoutingRow[] };
      drives: { addFolder(driveId: string, name: string): Promise<unknown> };
    };
    reactorClientModule?: {
      client: {
        read: { get(id: string): Promise<unknown> };
        drives: { addFolder(driveId: string, name: string): Promise<unknown> };
      };
      reactorModule?: {
        syncModule?: {
          syncManager?: {
            list(): Array<{
              meta: { name: string; collectionId: { driveId: string } };
            }>;
            remove(name: string): Promise<void>;
          };
        };
      };
    };
  };
};

async function gql<T>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(GRAPHQL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const result = (await response.json()) as { data?: T; errors?: unknown[] };
  if (!result.data) throw new Error(JSON.stringify(result.errors));
  return result.data;
}

async function createSwitchboardDrive(): Promise<string> {
  const { createEmptyDocument } = await gql<{
    createEmptyDocument: { id: string };
  }>(
    `mutation { createEmptyDocument(documentType: "powerhouse/document-drive") { id } }`,
  );
  return createEmptyDocument.id;
}

async function folderNames(driveId: string): Promise<string[]> {
  const { driveNodes } = await gql<{
    driveNodes: { results: Array<{ name: string }> };
  }>(
    `query($id: ID!) { driveNodes(driveId: $id) { results { ... on DriveFolderNode { name } } } }`,
    { id: driveId },
  );
  return driveNodes.results.map((node) => node.name);
}

/** Adds a folder to `driveId` on the switchboard itself. */
async function addFolderOnSwitchboard(
  driveId: string,
  name: string,
): Promise<void> {
  const id = crypto.randomUUID();
  await gql(
    `mutation($id: String!, $actions: [ActionInput!]!) { execute(documentIdOrSlug: $id, actions: $actions) { id } }`,
    {
      id: driveId,
      actions: [
        {
          id: crypto.randomUUID(),
          type: "ADD_FOLDER",
          timestampUtcMs: new Date().toISOString(),
          input: { id, name, parentFolder: null },
          scope: "global",
        },
      ],
    },
  );
}

async function listedFolders(page: Page, driveId: string): Promise<string[]> {
  try {
    return await page.evaluate(
      (id) =>
        (
          (window as unknown as PhWindow).ph?.drives?.find(
            (drive) => drive.header.id === id,
          )?.state.global.nodes ?? []
        ).map((node) => node.name),
      driveId,
    );
  } catch {
    return [];
  }
}

type Served = {
  mode: "router" | "remote";
  home: string;
  drives: Array<{ id: string; sync?: false }>;
};

/** `served` is read per request, so a test can change it before a reload. */
async function serveRouted(page: Page, served: () => Served): Promise<void> {
  // The worker-mode fixture pins the client; the served config must decide.
  await page.addInitScript((key) => {
    window.localStorage.removeItem(key);
  }, REACTOR_CLIENT_STORAGE_KEY);
  await page.route("**/powerhouse.config.json", async (route) => {
    const response = await route.fetch();
    const config = (await response.json()) as {
      connect: Record<string, Record<string, unknown> | undefined>;
    };
    const { mode, home, drives } = served();
    config.connect.instance = {
      ...config.connect.instance,
      reactorClient: mode,
      remoteBackends: [{ name: "sb", url: `${SWITCHBOARD}/d/${home}` }],
    };
    config.connect.drives = {
      ...config.connect.drives,
      defaultDrives: drives.map(({ id, sync }) => ({
        url: `${SWITCHBOARD}/d/${id}`,
        name: null,
        icon: null,
        backend: "sb",
        ...(sync === false ? { sync } : {}),
      })),
    };
    await route.fulfill({ response, json: config });
  });
}

async function syncedDriveIds(page: Page): Promise<string[] | null> {
  try {
    return await page.evaluate(() => {
      const ph = (window as unknown as PhWindow).ph;
      const sync =
        ph?.reactorClientModule?.reactorModule?.syncModule?.syncManager;
      return sync ? sync.list().map((r) => r.meta.collectionId.driveId) : null;
    });
  } catch {
    return null;
  }
}

async function heldLocally(page: Page, id: string): Promise<boolean> {
  return page.evaluate(async (driveId) => {
    const client = (window as unknown as PhWindow).ph?.reactorClientModule
      ?.client;
    if (!client) return false;
    try {
      await client.read.get(driveId);
      return true;
    } catch {
      return false;
    }
  }, id);
}

async function routing(page: Page) {
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            (window as unknown as PhWindow).ph?.fullReactorClient !== undefined,
        ),
      { timeout: LONG_VISIBLE_TIMEOUT },
    )
    .toBe(true);
  return page.evaluate(() =>
    (window as unknown as PhWindow).ph!.fullReactorClient!.describeRouting(),
  );
}

test.describe("Connect routed to a switchboard", () => {
  test.describe.configure({ timeout: DESCRIBE_TIMEOUT });

  test("opens a placed drive on the switchboard with no copy, and syncs the rest", async ({
    page,
  }) => {
    const placed = await createSwitchboardDrive();
    const synced = await createSwitchboardDrive();
    await serveRouted(page, () => ({
      mode: "router",
      home: placed,
      drives: [{ id: placed, sync: false }, { id: synced }],
    }));
    await page.goto("/");
    await waitForAppReady(page);

    const table = await routing(page);
    expect(table.backends).toEqual(["connect-local", "sb"]);
    expect(
      table.collections.find((row) => row.collectionId === placed),
    ).toMatchObject({ backend: "sb", origin: "config" });

    await expect
      .poll(() => syncedDriveIds(page), { timeout: LONG_VISIBLE_TIMEOUT })
      .toContain(synced);
    expect(await syncedDriveIds(page)).not.toContain(placed);
    await expect
      .poll(() => heldLocally(page, synced), { timeout: LONG_VISIBLE_TIMEOUT })
      .toBe(true);

    await page.evaluate(
      (driveId) =>
        (window as unknown as PhWindow).ph!.fullReactorClient!.drives.addFolder(
          driveId,
          "routed-folder",
        ),
      placed,
    );
    expect(await folderNames(placed)).toContain("routed-folder");
    expect(await heldLocally(page, placed)).toBe(false);
  });

  test("drops the browser's copy once a synced drive is placed on the switchboard", async ({
    page,
  }) => {
    const drive = await createSwitchboardDrive();
    let placed = false;
    await serveRouted(page, () => ({
      mode: "router",
      home: drive,
      drives: [placed ? { id: drive, sync: false } : { id: drive }],
    }));
    await page.goto("/");
    await waitForAppReady(page);
    await expect
      .poll(() => syncedDriveIds(page), { timeout: LONG_VISIBLE_TIMEOUT })
      .toContain(drive);
    await expect
      .poll(() => heldLocally(page, drive), { timeout: LONG_VISIBLE_TIMEOUT })
      .toBe(true);

    placed = true;
    await page.reload();
    await waitForAppReady(page);
    await routing(page);
    await expect
      .poll(() => syncedDriveIds(page), { timeout: LONG_VISIBLE_TIMEOUT })
      .not.toBeNull();
    await expect
      .poll(() => syncedDriveIds(page), { timeout: LONG_VISIBLE_TIMEOUT })
      .not.toContain(drive);

    // The copy left in the browser no longer syncs: it misses the switchboard's
    // folder and keeps one of its own, so a listing shows which copy it read.
    await addFolderOnSwitchboard(drive, "added-on-sb");
    await page.evaluate(
      (driveId) =>
        (
          window as unknown as PhWindow
        ).ph!.reactorClientModule!.client.drives.addFolder(
          driveId,
          "stale-copy",
        ),
      drive,
    );
    await page.reload();
    await waitForAppReady(page);
    await routing(page);
    await expect
      .poll(() => listedFolders(page, drive), { timeout: LONG_VISIBLE_TIMEOUT })
      .toContain("added-on-sb");
    expect(await listedFolders(page, drive)).not.toContain("stale-copy");
  });

  test("runs with only the switchboard", async ({ page }) => {
    const drive = await createSwitchboardDrive();
    await serveRouted(page, () => ({
      mode: "remote",
      home: drive,
      drives: [{ id: drive }],
    }));
    await page.goto("/");
    await waitForAppReady(page);

    expect((await routing(page)).backends).toEqual(["sb"]);
    expect(
      await page.evaluate(
        () => (window as unknown as PhWindow).ph?.reactorClientModule,
      ),
    ).toBeUndefined();
    await page.evaluate(
      (driveId) =>
        (window as unknown as PhWindow).ph!.fullReactorClient!.drives.addFolder(
          driveId,
          "remote-only-folder",
        ),
      drive,
    );
    expect(await folderNames(drive)).toContain("remote-only-folder");
  });
});
