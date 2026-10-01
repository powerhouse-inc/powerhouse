// A polled PURGE_DOCUMENT marker erases the document in Connect's reactor.

import type { Page } from "@playwright/test";
import { deleteNode, updateNode } from "@powerhousedao/shared/document-drive";
import { expect, test } from "./helpers/fixtures.js";
import {
  ERASURE_ADMIN,
  ERASURE_DRIVE_ID,
  ERASURE_DRIVE_NAME,
  startPrivacySwitchboard,
  type PrivacySwitchboard,
} from "./helpers/privacy-switchboard.js";
import { DESCRIBE_TIMEOUT, LONG_VISIBLE_TIMEOUT } from "./helpers/timeouts.js";
import { waitForAppReady } from "./helpers/wait.js";

type PhWindow = {
  ph?: {
    selectedNodeId?: string;
    reactorClientModule?: {
      client?: { get: (id: string) => Promise<unknown> };
      reactorModule?: {
        pg?: {
          query: (
            sql: string,
            params: unknown[],
          ) => Promise<{ rows: unknown[] }>;
        };
      };
    };
  };
};

const ERASED_NOTICE = "The document you were editing has been erased";

async function createDocument(graphqlUrl: string): Promise<string> {
  const response = await fetch(graphqlUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      query: `mutation($parentId: String) { createEmptyDocument(documentType: "powerhouse/document-model", parentIdOrSlug: $parentId) { id } }`,
      variables: { parentId: ERASURE_DRIVE_ID },
    }),
  });
  const result = (await response.json()) as {
    data?: { createEmptyDocument?: { id: string } };
    errors?: unknown[];
  };
  const id = result.data?.createEmptyDocument?.id;
  if (!id) {
    throw new Error(`createEmptyDocument failed: ${JSON.stringify(result)}`);
  }
  return id;
}

// null while the page is navigating, so callers can poll across a reload.
async function heldInConnect(page: Page, id: string): Promise<boolean | null> {
  try {
    return await page.evaluate(async (documentId) => {
      const client = (window as unknown as PhWindow).ph?.reactorClientModule
        ?.client;
      if (!client) return null;
      try {
        await client.get(documentId);
        return true;
      } catch {
        return false;
      }
    }, id);
  } catch {
    return null;
  }
}

function selectedNodeId(page: Page): Promise<string | undefined> {
  return page.evaluate(
    () => (window as unknown as PhWindow).ph?.selectedNodeId,
  );
}

// The tab-side reactor exposes its PGlite; the SharedWorker's stays inside.
function tombstoneRows(page: Page, id: string): Promise<number | null> {
  return page.evaluate(async (documentId) => {
    const pg = (window as unknown as PhWindow).ph?.reactorClientModule
      ?.reactorModule?.pg;
    if (!pg) return null;
    const result = await pg.query(
      'select "documentId" from reactor.document_purges where "documentId" = $1',
      [documentId],
    );
    return result.rows.length;
  }, id);
}

async function openDrive(page: Page): Promise<void> {
  const drive = page.getByRole("heading", {
    name: ERASURE_DRIVE_NAME,
    level: 3,
    exact: true,
  });
  await expect(drive).toBeVisible({ timeout: LONG_VISIBLE_TIMEOUT });
  await drive.click();
  await waitForAppReady(page);
}

test.describe.configure({ timeout: DESCRIBE_TIMEOUT });

test.describe("document erasure", () => {
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

  let privacy: PrivacySwitchboard;

  test.beforeAll(async () => {
    privacy = await startPrivacySwitchboard();
  });

  test.afterAll(async () => {
    await privacy?.stop();
  });

  test("Connect erases a document on a polled purge marker", async ({
    page,
  }) => {
    const { switchboard } = privacy;
    const erasure = switchboard.privacy!.erasure;
    const documentName = `erasure-${Date.now()}`;
    const documentHeading = page.getByText(documentName, { exact: true });
    let documentId = "";
    let requestId = "";

    await test.step("Connect syncs the switchboard's drive", async () => {
      await page.goto(`/?driveUrl=${encodeURIComponent(privacy.driveUrl)}`);
      await waitForAppReady(page);
      await openDrive(page);
    });

    // A load carrying CREATE and DELETE together never applies: hold it live first.
    await test.step("Connect holds the document live", async () => {
      documentId = await createDocument(privacy.graphqlUrl);
      await switchboard.reactor.execute(ERASURE_DRIVE_ID, "main", [
        updateNode({ id: documentId, name: documentName }),
      ]);
      await expect(documentHeading).toBeVisible({
        timeout: LONG_VISIBLE_TIMEOUT,
      });
      await expect
        .poll(() => heldInConnect(page, documentId), {
          timeout: LONG_VISIBLE_TIMEOUT,
        })
        .toBe(true);
    });

    await test.step("the document is open in its editor", async () => {
      await documentHeading.click();
      await waitForAppReady(page);
      await expect
        .poll(() => selectedNodeId(page), { timeout: LONG_VISIBLE_TIMEOUT })
        .toBe(documentId);
    });

    await test.step("the switchboard deletes and purges it unseen", async () => {
      // Paused so the marker, not the delete, is what Connect learns first.
      privacy.pause();
      await switchboard.reactor.execute(ERASURE_DRIVE_ID, "main", [
        deleteNode({ id: documentId }),
      ]);
      await switchboard.reactor.deleteDocument(documentId);
      ({ requestId } = await erasure.request([documentId], {
        requestedBy: ERASURE_ADMIN,
        deadline: new Date(),
      }));
      await expect
        .poll(async () => (await erasure.status(requestId)).items[0]?.status, {
          timeout: 30_000,
        })
        .toBe("purged");
      await expect(switchboard.reactor.get(documentId)).rejects.toThrow();
      expect(await selectedNodeId(page)).toBe(documentId);
      privacy.resume();
    });

    await test.step("Connect applies the marker", async () => {
      await expect(page.getByText(ERASED_NOTICE)).toBeVisible({
        timeout: LONG_VISIBLE_TIMEOUT,
      });
      await expect
        .poll(() => selectedNodeId(page), { timeout: LONG_VISIBLE_TIMEOUT })
        .not.toBe(documentId);
      await expect(documentHeading).toBeHidden({
        timeout: LONG_VISIBLE_TIMEOUT,
      });
      await expect
        .poll(() => heldInConnect(page, documentId), {
          timeout: LONG_VISIBLE_TIMEOUT,
        })
        .toBe(false);
    });

    await test.step("Connect acknowledges the marker", async () => {
      // Marker grace is days, so complete means Connect's cursor passed it.
      await expect
        .poll(async () => (await erasure.status(requestId)).status, {
          timeout: LONG_VISIBLE_TIMEOUT,
        })
        .toBe("complete");
    });

    await test.step("it stays erased after a reload", async () => {
      await page.goto("/");
      await waitForAppReady(page);
      await openDrive(page);
      await expect(documentHeading).toBeHidden({
        timeout: LONG_VISIBLE_TIMEOUT,
      });
      await expect
        .poll(() => heldInConnect(page, documentId), {
          timeout: LONG_VISIBLE_TIMEOUT,
        })
        .toBe(false);
      const tombstones = await tombstoneRows(page, documentId);
      if (tombstones !== null) expect(tombstones).toBe(1);
    });
  });
});
