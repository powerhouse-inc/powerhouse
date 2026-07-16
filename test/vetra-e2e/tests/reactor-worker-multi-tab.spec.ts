// N Connect tabs + 1 switchboard must share ONE SharedWorker reactor.
// Tabs MUST come from the default fixture context: the reactorWorkerFlag
// fixture attaches the ph:reactorWorker init script to that context only,
// and a second BrowserContext is a separate storage partition that would
// legitimately spawn its own SharedWorker.

import type { Browser, Page } from "@playwright/test";
import {
  expect,
  reactorWorkerModeRequested,
  test,
} from "./helpers/fixtures.js";
import { createDocument, navigateToVetraDrive } from "./helpers/document.js";
import { DESCRIBE_TIMEOUT, LONG_VISIBLE_TIMEOUT } from "./helpers/timeouts.js";
import { waitForAppReady } from "./helpers/wait.js";

const rawTabCount = process.env.PH_TAB_COUNT;
const parsedTabCount =
  rawTabCount === undefined ? 3 : Number.parseInt(rawTabCount, 10);
if (!Number.isInteger(parsedTabCount)) {
  throw new Error(`PH_TAB_COUNT must be an integer, got "${rawTabCount}"`);
}
const TAB_COUNT = Math.max(2, parsedTabCount);

const REACTOR_GRAPHQL_URL = "http://localhost:4002/graphql/r";

type WorkerInfo = {
  namespace: string;
  ownerId: string;
  bootedAtMs: number;
  connectedClients: number;
  appBuildId: string;
  rpcProtocolVersion: number;
};

type PhWindow = {
  ph?: {
    drives?: Array<{
      state?: {
        global?: { nodes?: Array<{ id: string; name?: string }> };
      };
    }>;
    reactorClientModule?: {
      kind?: string;
      adminClient?: {
        info: () => Promise<WorkerInfo>;
        restart: () => Promise<void>;
      };
    };
  };
  powerhouse?: {
    pglite?: {
      db?: { query: (sql: string) => Promise<unknown> } | null;
    };
  };
};

async function openTabs(page: Page, count: number): Promise<Page[]> {
  const tabs: Page[] = [page];
  for (let i = 1; i < count; i++) {
    tabs.push(await page.context().newPage());
  }
  for (const tab of tabs) {
    await tab.goto("/");
    await waitForAppReady(tab);
  }
  return tabs;
}

async function waitForWorkerMode(tab: Page): Promise<void> {
  await expect
    .poll(
      () =>
        tab.evaluate(
          () => (window as unknown as PhWindow).ph?.reactorClientModule?.kind,
        ),
      { timeout: 60_000 },
    )
    .toBe("worker");
}

// Null instead of throwing so callers can poll across reloads.
async function tryGetWorkerInfo(tab: Page): Promise<WorkerInfo | null> {
  try {
    return await tab.evaluate(async () => {
      const module = (window as unknown as PhWindow).ph?.reactorClientModule;
      if (module?.kind !== "worker" || !module.adminClient) return null;
      return await module.adminClient.info();
    });
  } catch {
    return null;
  }
}

async function getWorkerInfo(tab: Page): Promise<WorkerInfo> {
  await expect
    .poll(async () => (await tryGetWorkerInfo(tab)) !== null, {
      timeout: 60_000,
    })
    .toBe(true);
  const info = await tryGetWorkerInfo(tab);
  if (!info) throw new Error("worker info disappeared after poll");
  return info;
}

// The single-instance proof: ownerId/bootedAtMs are minted once per worker
// boot, so equality across tabs means one shared reactor.
async function expectSameWorkerIdentity(tabs: Page[]): Promise<WorkerInfo> {
  const infos = [];
  for (const tab of tabs) {
    infos.push(await getWorkerInfo(tab));
  }
  const [first, ...rest] = infos;
  for (const info of rest) {
    expect(info.ownerId).toBe(first.ownerId);
    expect(info.bootedAtMs).toBe(first.bootedAtMs);
    expect(info.namespace).toBe(first.namespace);
    expect(info.appBuildId).toBe(first.appBuildId);
    expect(info.rpcProtocolVersion).toBe(first.rpcProtocolVersion);
  }
  return first;
}

// The relational store dies silently when its PGlite init fails (the worker
// degrades instead of failing boot), so probe it through the tab-side proxy.
async function expectRelationalStoreAlive(tab: Page): Promise<void> {
  await expect
    .poll(
      async () => {
        try {
          return await tab.evaluate(async () => {
            const db = (window as unknown as PhWindow).powerhouse?.pglite?.db;
            if (!db) return "no-proxy";
            await db.query("select 1");
            return "ok";
          });
        } catch (error) {
          return `error: ${String(error).slice(0, 200)}`;
        }
      },
      { timeout: 60_000 },
    )
    .toBe("ok");
}

async function countReactorSharedWorkers(browser: Browser): Promise<number> {
  const cdp = await browser.newBrowserCDPSession();
  try {
    const { targetInfos } = await cdp.send("Target.getTargets");
    return targetInfos.filter(
      (t) =>
        t.type === "shared_worker" &&
        (t.title.startsWith("ph-reactor:") || t.url.includes("reactor.worker")),
    ).length;
  } finally {
    await cdp.detach();
  }
}

interface GqlResponse<T> {
  data?: T;
  errors?: Array<{ message?: string }>;
}

async function gql<T>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<GqlResponse<T>> {
  const response = await fetch(REACTOR_GRAPHQL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  return (await response.json()) as GqlResponse<T>;
}

// The drive id depends on the project path — resolve it from the drive page
// URL rather than hardcoding.
async function resolveDriveId(driveUrl: string): Promise<string> {
  const slug = decodeURIComponent(
    new URL(driveUrl).pathname.split("/d/")[1]?.split("/")[0] ?? "",
  );
  expect(slug).not.toBe("");
  const result = await gql<{
    findDocuments?: {
      items?: Array<{ id: string; slug?: string | null }>;
    };
  }>(
    `query { findDocuments(search: { type: "powerhouse/document-drive" }) { items { id slug } } }`,
  );
  const items = result.data?.findDocuments?.items ?? [];
  const drive = items.find((d) => d.slug === slug || d.id === slug);
  if (!drive) {
    throw new Error(
      `drive ${slug} not found on switchboard: ${JSON.stringify(items)}`,
    );
  }
  return drive.id;
}

test.describe.configure({ timeout: DESCRIBE_TIMEOUT });

test.describe("reactor worker multi-tab", () => {
  test.skip(
    !reactorWorkerModeRequested(),
    "Only runs when PH_REACTOR_WORKER is set",
  );

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

  test(`${TAB_COUNT} tabs attach to the same SharedWorker reactor instance`, async ({
    page,
    browser,
  }) => {
    const tabs = await openTabs(page, TAB_COUNT);
    for (const tab of tabs) {
      await waitForWorkerMode(tab);
    }

    const first = await expectSameWorkerIdentity(tabs);
    expect(first.namespace).toMatch(/^ph-reactor:/);

    await expectRelationalStoreAlive(tabs[0]);

    // >= not ===: connectedClients counts ports since worker boot and never
    // decrements (a reload adds one), so exact equality is reload-fragile.
    await expect
      .poll(async () => (await tryGetWorkerInfo(tabs[0]))?.connectedClients, {
        timeout: 30_000,
      })
      .toBeGreaterThanOrEqual(TAB_COUNT);

    await expect
      .poll(() => countReactorSharedWorkers(browser), { timeout: 30_000 })
      .toBe(1);
  });

  test("a document created in one tab reaches every tab and the switchboard", async ({
    page,
  }) => {
    const tabs = await openTabs(page, TAB_COUNT);
    for (const tab of tabs) {
      await waitForWorkerMode(tab);
      await navigateToVetraDrive(tab);
    }
    // Precondition: without this, everything below would also pass with N
    // independent per-tab reactors converging through switchboard sync.
    await expectSameWorkerIdentity(tabs);
    const driveId = await resolveDriveId(tabs[0].url());

    const documentName = `multi-tab-${Date.now()}`;
    await createDocument(tabs[0], "powerhouse/document-model", documentName);

    for (const tab of tabs.slice(1)) {
      await expect(
        tab.getByRole("heading", { name: documentName, level: 3, exact: true }),
      ).toBeVisible({ timeout: LONG_VISIBLE_TIMEOUT });
    }

    // Look the document up by id — findDocuments(parentId) returns the oldest
    // 100 children and would silently truncate on a long-lived local server.
    let createdByTabId: string | undefined;
    await expect
      .poll(
        async () => {
          try {
            createdByTabId = await tabs[0].evaluate(
              (name) =>
                ((window as unknown as PhWindow).ph?.drives ?? [])
                  .flatMap((drive) => drive.state?.global?.nodes ?? [])
                  .find((node) => node.name === name)?.id,
              documentName,
            );
            return createdByTabId !== undefined;
          } catch {
            return false;
          }
        },
        { timeout: LONG_VISIBLE_TIMEOUT },
      )
      .toBe(true);

    // Client -> server: the shared worker's single sync loop delivers it to
    // the switchboard. (A thrown poll callback aborts expect.poll, hence the
    // try/catch guards.)
    await expect
      .poll(
        async () => {
          try {
            const result = await gql<{
              document?: { document?: { id: string; name: string } };
            }>(
              `query($id: String!) { document(identifier: $id) { document { id name } } }`,
              { id: createdByTabId },
            );
            return result.data?.document?.document?.name === documentName;
          } catch {
            return false;
          }
        },
        { timeout: LONG_VISIBLE_TIMEOUT },
      )
      .toBe(true);

    // Server -> client: a document created on the switchboard fans out to
    // every tab through the same single worker.
    const created = await gql<{ createEmptyDocument?: { id: string } }>(
      `mutation($parentId: String) { createEmptyDocument(documentType: "powerhouse/document-model", parentIdentifier: $parentId) { id } }`,
      { parentId: driveId },
    );
    const createdId = created.data?.createEmptyDocument?.id;
    expect(
      createdId,
      `createEmptyDocument failed: ${JSON.stringify(created.errors)}`,
    ).toBeTruthy();

    for (const tab of tabs) {
      await expect
        .poll(
          () =>
            tab.evaluate(
              (id) =>
                ((window as unknown as PhWindow).ph?.drives ?? []).some(
                  (drive) =>
                    (drive.state?.global?.nodes ?? []).some(
                      (node) => node.id === id,
                    ),
                ),
              createdId,
            ),
          { timeout: LONG_VISIBLE_TIMEOUT },
        )
        .toBe(true);
    }
  });

  test("worker restart converges every tab on a single fresh instance", async ({
    page,
    browser,
  }) => {
    const tabs = await openTabs(page, TAB_COUNT);
    for (const tab of tabs) {
      await waitForWorkerMode(tab);
    }
    const before = await getWorkerInfo(tabs[0]);

    // Fire-and-forget from the last tab: restart broadcasts a reload to every
    // tab (including the caller), so the promise may never settle tab-side.
    await tabs[TAB_COUNT - 1].evaluate(() => {
      const module = (window as unknown as PhWindow).ph?.reactorClientModule;
      void module?.adminClient?.restart().catch(() => undefined);
    });

    const afterInfos: WorkerInfo[] = [];
    for (const tab of tabs) {
      await expect
        .poll(
          async () => {
            const info = await tryGetWorkerInfo(tab);
            return info !== null && info.ownerId !== before.ownerId;
          },
          { timeout: 120_000 },
        )
        .toBe(true);
      const info = await tryGetWorkerInfo(tab);
      if (!info) throw new Error("worker info disappeared after restart poll");
      afterInfos.push(info);
    }

    const [first, ...rest] = afterInfos;
    for (const info of rest) {
      expect(info.ownerId).toBe(first.ownerId);
      expect(info.bootedAtMs).toBe(first.bootedAtMs);
      expect(info.namespace).toBe(first.namespace);
    }
    expect(first.ownerId).not.toBe(before.ownerId);
    expect(first.bootedAtMs).toBeGreaterThan(before.bootedAtMs);
    // Restart spawns the replacement under a gen-suffixed name.
    expect(first.namespace).toContain("#");
    expect(first.namespace).not.toBe(before.namespace);

    // All tabs reconnected to the one fresh worker.
    await expect
      .poll(async () => (await tryGetWorkerInfo(tabs[0]))?.connectedClients, {
        timeout: 30_000,
      })
      .toBeGreaterThanOrEqual(TAB_COUNT);

    // The pre-restart worker must be gone and the fresh boot not degraded.
    await expect
      .poll(() => countReactorSharedWorkers(browser), { timeout: 30_000 })
      .toBe(1);
    await expectRelationalStoreAlive(tabs[0]);
  });
});
