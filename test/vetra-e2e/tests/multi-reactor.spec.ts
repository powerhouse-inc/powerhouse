// Connect routed to the Vetra switchboard (4002) by a rewritten served config.

import type { Locator, Page } from "@playwright/test";
import {
  expect,
  reactorWorkerModeRequested,
  test,
} from "./helpers/fixtures.js";
import { DESCRIBE_TIMEOUT, LONG_VISIBLE_TIMEOUT } from "./helpers/timeouts.js";
import { waitForAppReady } from "./helpers/wait.js";

const SWITCHBOARD = "http://localhost:4002";
const GRAPHQL = `${SWITCHBOARD}/graphql/r`;
const REACTOR_CLIENT_STORAGE_KEY = "ph:reactorClient";

type RoutingRow = {
  collectionId: string;
  backend: string;
  origin?: string;
  configured?: string;
};

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
        read: {
          get(id: string): Promise<{
            state: { global: { nodes: Array<{ name: string }> } };
          }>;
        };
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

/** Adds folders to `driveId` on the switchboard itself, in order. */
async function addFoldersOnSwitchboard(
  driveId: string,
  names: string[],
): Promise<void> {
  await gql(
    `mutation($id: String!, $actions: [ActionInput!]!) { execute(documentIdOrSlug: $id, actions: $actions) { id } }`,
    {
      id: driveId,
      actions: names.map((name) => ({
        id: crypto.randomUUID(),
        type: "ADD_FOLDER",
        timestampUtcMs: new Date().toISOString(),
        input: { id: crypto.randomUUID(), name, parentFolder: null },
        scope: "global",
      })),
    },
  );
}

async function addFolderOnSwitchboard(
  driveId: string,
  name: string,
): Promise<void> {
  await addFoldersOnSwitchboard(driveId, [name]);
}

/** A backlog the copy pulls before `marker`, so its first pull takes a while. */
async function addBacklogThen(driveId: string, marker: string): Promise<void> {
  const backlog = Array.from({ length: 400 }, (_, i) => `${marker}-${i}`);
  await addFoldersOnSwitchboard(driveId, [...backlog, marker]);
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

async function routeOf(
  page: Page,
  id: string,
): Promise<RoutingRow | undefined> {
  try {
    return await page.evaluate(
      (driveId) =>
        (window as unknown as PhWindow).ph?.fullReactorClient
          ?.describeRouting()
          .collections.find((row) => row.collectionId === driveId),
      id,
    );
  } catch {
    return undefined;
  }
}

/** The folders of the browser's own copy of `id`, or null without one. */
async function localFolders(page: Page, id: string): Promise<string[] | null> {
  try {
    return await page.evaluate(async (driveId) => {
      const client = (window as unknown as PhWindow).ph?.reactorClientModule
        ?.client;
      if (!client) return null;
      try {
        const drive = await client.read.get(driveId);
        return drive.state.global.nodes.map((node) => node.name);
      } catch {
        return null;
      }
    }, id);
  } catch {
    return null;
  }
}

/** Opens the drive's settings, where it can be moved. */
async function driveSettings(page: Page, id: string): Promise<Locator> {
  await page.goto(`/?modal=drive-settings&driveId=${id}`);
  await waitForAppReady(page);
  const section = page.getByTestId("drive-placement");
  await expect(section).toBeVisible({ timeout: LONG_VISIBLE_TIMEOUT });
  return section;
}

/**
 * Keeps a copy of `driveId` from `mover`, and returns `watcher`'s own copy at
 * the moment its routing for the drive first leaves the switchboard.
 */
async function keepCopyWhileWatching(
  watcher: Page,
  mover: Page,
  driveId: string,
): Promise<string[] | null> {
  const section = await driveSettings(mover, driveId);
  await expect
    .poll(() => routeOf(watcher, driveId), { timeout: LONG_VISIBLE_TIMEOUT })
    .toMatchObject({ backend: "sb" });
  const atFlip = watcher.evaluate(async (id) => {
    const ph = (window as unknown as PhWindow).ph!;
    (window as unknown as { watching?: boolean }).watching = true;
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      const row = ph
        .fullReactorClient!.describeRouting()
        .collections.find((entry) => entry.collectionId === id);
      if (row?.backend !== "sb") {
        const drive = await ph.reactorClientModule!.client.read.get(id);
        return drive.state.global.nodes.map((node) => node.name);
      }
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    return null;
  }, driveId);
  await watcher.waitForFunction(
    () => (window as unknown as { watching?: boolean }).watching === true,
  );
  await section
    .getByRole("button", { name: "Keep a copy in this browser" })
    .click();
  return atFlip;
}

const LOCAL_ROW = { backend: "connect-local", origin: "runtime" };
const SB_ROW = { backend: "sb", origin: "runtime" };

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
    // Placements reach the router once the drive is read from the switchboard.
    await expect
      .poll(() => routeOf(page, placed), { timeout: LONG_VISIBLE_TIMEOUT })
      .toMatchObject({ backend: "sb", origin: "config" });

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

  test("moves a drive both ways in this browser, until the host config changes", async ({
    page,
  }) => {
    test.skip(
      reactorWorkerModeRequested(),
      "The worker run covers this across two tabs",
    );
    const drive = await createSwitchboardDrive();
    let configPlaces = true;
    await serveRouted(page, () => ({
      mode: "router",
      home: drive,
      drives: [configPlaces ? { id: drive, sync: false } : { id: drive }],
    }));

    const section = await driveSettings(page, drive);
    await expect(section).toContainText("Opens on sb.");
    await section
      .getByRole("button", { name: "Keep a copy in this browser" })
      .click();
    await expect(
      section.getByText("Moved in this browser. Host config: On sb only"),
    ).toBeVisible({ timeout: LONG_VISIBLE_TIMEOUT });
    expect(await routeOf(page, drive)).toMatchObject({
      ...LOCAL_ROW,
      configured: "sb",
    });
    expect(await syncedDriveIds(page)).toContain(drive);
    expect(await localFolders(page, drive)).not.toBeNull();

    await page.reload();
    await waitForAppReady(page);
    await expect
      .poll(() => routeOf(page, drive), { timeout: LONG_VISIBLE_TIMEOUT })
      .toMatchObject(LOCAL_ROW);
    expect(await syncedDriveIds(page)).toContain(drive);

    const again = await driveSettings(page, drive);
    await again.getByRole("button", { name: "Open on sb only" }).click();
    await expect(again).toContainText("Opens on sb.", {
      timeout: LONG_VISIBLE_TIMEOUT,
    });
    await expect(again.getByRole("status")).toHaveCount(0);
    expect(await routeOf(page, drive)).toMatchObject({
      backend: "sb",
      origin: "config",
    });
    expect(await syncedDriveIds(page)).not.toContain(drive);
    // The browser's copy is left in place, unread.
    expect(await localFolders(page, drive)).not.toBeNull();

    // A move made under one host config is dropped once that config changes.
    const kept = await driveSettings(page, drive);
    await kept
      .getByRole("button", { name: "Keep a copy in this browser" })
      .click();
    await expect(kept.getByText(/Moved in this browser/)).toBeVisible({
      timeout: LONG_VISIBLE_TIMEOUT,
    });
    configPlaces = false;
    await page.reload();
    await waitForAppReady(page);
    configPlaces = true;
    await page.reload();
    await waitForAppReady(page);
    await expect
      .poll(() => routeOf(page, drive), { timeout: LONG_VISIBLE_TIMEOUT })
      .toMatchObject({ backend: "sb", origin: "config" });
    await expect
      .poll(() => syncedDriveIds(page), { timeout: LONG_VISIBLE_TIMEOUT })
      .not.toContain(drive);
  });

  test("moves a drive both ways from either tab, and every tab follows", async ({
    page,
    context,
  }) => {
    test.skip(
      !reactorWorkerModeRequested(),
      "Tabs share one reactor only in the worker",
    );
    const placed = await createSwitchboardDrive();
    const synced = await createSwitchboardDrive();
    const served = (): Served => ({
      mode: "router",
      home: placed,
      drives: [{ id: placed, sync: false }, { id: synced }],
    });
    const other = await context.newPage();
    await serveRouted(page, served);
    await serveRouted(other, served);
    await page.goto("/");
    await waitForAppReady(page);
    await other.goto("/");
    await waitForAppReady(other);
    await expect
      .poll(() => syncedDriveIds(page), { timeout: LONG_VISIBLE_TIMEOUT })
      .toContain(synced);

    // Keep a copy of the placed drive, from the first tab.
    const first = await driveSettings(page, placed);
    await first
      .getByRole("button", { name: "Keep a copy in this browser" })
      .click();
    await expect(
      first.getByText("Moved in this browser. Host config: On sb only"),
    ).toBeVisible({ timeout: LONG_VISIBLE_TIMEOUT });
    for (const tab of [page, other]) {
      await expect
        .poll(() => routeOf(tab, placed), { timeout: LONG_VISIBLE_TIMEOUT })
        .toMatchObject({ ...LOCAL_ROW, configured: "sb" });
      await expect
        .poll(() => syncedDriveIds(tab), { timeout: LONG_VISIBLE_TIMEOUT })
        .toContain(placed);
    }

    // Open the synced drive on the switchboard only, from the second tab.
    const second = await driveSettings(other, synced);
    await second.getByRole("button", { name: "Open on sb only" }).click();
    await expect(
      second.getByText(
        "Moved in this browser. Host config: Copy in this browser",
      ),
    ).toBeVisible({ timeout: LONG_VISIBLE_TIMEOUT });
    for (const tab of [page, other]) {
      await expect
        .poll(() => routeOf(tab, synced), { timeout: LONG_VISIBLE_TIMEOUT })
        .toMatchObject(SB_ROW);
      await expect
        .poll(() => syncedDriveIds(tab), { timeout: LONG_VISIBLE_TIMEOUT })
        .not.toContain(synced);
    }
    expect(await localFolders(page, synced)).not.toBeNull();

    // Both moves survive a reload.
    await page.reload();
    await waitForAppReady(page);
    await expect
      .poll(() => routeOf(page, placed), { timeout: LONG_VISIBLE_TIMEOUT })
      .toMatchObject(LOCAL_ROW);
    await expect
      .poll(() => routeOf(page, synced), { timeout: LONG_VISIBLE_TIMEOUT })
      .toMatchObject(SB_ROW);
    expect(await syncedDriveIds(page)).toContain(placed);
    expect(await syncedDriveIds(page)).not.toContain(synced);

    // A copy kept again, back to the config, catches up with what changed
    // on the switchboard before the first tab reads it.
    await addBacklogThen(synced, "while-on-sb");
    expect(await keepCopyWhileWatching(page, other, synced)).toContain(
      "while-on-sb",
    );
    await expect(
      other.getByTestId("drive-placement").getByText(/Moved in this browser/),
    ).toHaveCount(0, { timeout: LONG_VISIBLE_TIMEOUT });
    for (const tab of [page, other]) {
      await expect
        .poll(() => syncedDriveIds(tab), { timeout: LONG_VISIBLE_TIMEOUT })
        .toContain(synced);
      // No placement: the router finds the drive as it did before the move.
      await expect
        .poll(async () => (await routeOf(tab, synced))?.origin, {
          timeout: LONG_VISIBLE_TIMEOUT,
        })
        .toBeUndefined();
    }
    await expect
      .poll(() => localFolders(page, synced), {
        timeout: LONG_VISIBLE_TIMEOUT,
      })
      .toContain("while-on-sb");

    // Reset to the host config, from the first tab.
    const reset = await driveSettings(page, placed);
    await reset.getByRole("button", { name: "Reset to config" }).click();
    for (const tab of [page, other]) {
      await expect
        .poll(() => routeOf(tab, placed), { timeout: LONG_VISIBLE_TIMEOUT })
        .toMatchObject({ backend: "sb", origin: "config" });
      await expect
        .poll(() => syncedDriveIds(tab), { timeout: LONG_VISIBLE_TIMEOUT })
        .not.toContain(placed);
    }

    // Keeping a copy again from the second tab: the browser's copy is now
    // stale, and the first tab must not list from it before it has caught up.
    await addBacklogThen(placed, "after-reset");
    await expect
      .poll(() => listedFolders(page, placed), {
        timeout: LONG_VISIBLE_TIMEOUT,
      })
      .toContain("after-reset");
    expect(await keepCopyWhileWatching(page, other, placed)).toContain(
      "after-reset",
    );
    await expect
      .poll(() => listedFolders(page, placed), {
        timeout: LONG_VISIBLE_TIMEOUT,
      })
      .toContain("after-reset");
    await other.close();
  });
});
