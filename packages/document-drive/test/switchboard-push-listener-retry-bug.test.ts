import type {
  ListenerRevision,
  ServerListener,
  StrandUpdate,
} from "document-drive";
import {
  addFile,
  driveDocumentModelModule,
  ReactorBuilder,
  SwitchboardPushTransmitter,
} from "document-drive";
import type { DocumentModelModule } from "document-model";
import {
  documentModelCreateDocument,
  documentModelDocumentModelModule,
  setModelName,
} from "document-model";
import { generateId } from "document-model/core";
import { beforeEach, describe, expect, test, vi } from "vitest";

/**
 * Reproduces the "Maximum retries exhausted" bug observed in agent-rupert.
 *
 * Root cause chain:
 * 1. Agent starts with in-memory storage (listenerRev = 0 for all sync units)
 * 2. Agent pulls documents from switchboard (they arrive at revision N)
 * 3. setListener() calls triggerUpdate(true, { type: "local" })
 * 4. Listener sees listenerRev(0) < driveRevision(N) → pushes ops 0..N
 * 5. Loop prevention bypassed (source.type === "local", not "trigger")
 * 6. Remote switchboard rejects: "Missing operations" + revision: 0
 * 7. Listener updates listenerRev = 0 (no progress), retries recursively
 * 8. After 500 retries: "Maximum retries exhausted" thrown & silently caught
 * 9. listenerStatus ends as "SUCCESS" due to recursive catch cascade
 * 10. Every future triggerUpdate repeats the 500-retry storm
 */

let pushUpdatesCallCount = 0;
let lastPushedStrands: StrandUpdate[] = [];

vi.mock(import("graphql-request"), async (importOriginal) => {
  const originalModule = await importOriginal();

  return {
    ...originalModule,
    GraphQLClient: vi.fn().mockImplementation(() => {
      return {
        request: vi
          .fn()
          .mockImplementation(
            (query: string, { strands }: { strands: StrandUpdate[] }) => {
              if (query.includes("mutation pushUpdates")) {
                pushUpdatesCallCount++;
                lastPushedStrands = strands;
                // Remote already has these ops — rejects with non-advancing
                // revision, causing infinite retry loop in listener-manager
                return Promise.resolve({
                  pushUpdates: strands.map<ListenerRevision>(
                    ({ operations, ...strand }) => ({
                      ...strand,
                      status: "ERROR",
                      error: "Missing operations from revision 0",
                      revision: 0,
                    }),
                  ),
                });
              }

              return Promise.resolve({});
            },
          ),
      };
    }),
    gql: vi.fn().mockImplementation((...args) => args.join("")),
  };
});

// --- Shared helpers ---

const driveId = "test-drive";
const driveName = "Test Drive";
const remoteUrl = "https://switchboard.example.com/d/powerhouse";

async function buildServerWithDocumentAtRevision() {
  const documentModels = [
    documentModelDocumentModelModule,
    driveDocumentModelModule,
  ] as DocumentModelModule<any>[];
  const builder = new ReactorBuilder(documentModels);
  const server = builder.build();
  await server.initialize();

  await server.addDrive({
    id: driveId,
    global: { name: driveName },
  });

  const document = documentModelCreateDocument();
  const documentId = document.header.id;
  await server.addDocument(document);

  await server.addAction(
    driveId,
    addFile({
      id: documentId,
      name: "test-doc",
      documentType: "powerhouse/document-model",
    }),
  );

  await server.addAction(documentId, setModelName({ name: "test" }));

  return { server, builder, documentId };
}

function createListener(): ServerListener {
  const uuid = generateId();
  return {
    driveId,
    listenerId: uuid,
    block: false,
    filter: {
      branch: ["main"],
      documentId: ["*"],
      documentType: ["*"],
      scope: ["global"],
    },
    system: false,
    label: `SwitchboardPush #${uuid}`,
    callInfo: {
      data: remoteUrl,
      name: "SwitchboardPush",
      transmitterType: "SwitchboardPush",
    },
  };
}

// ===================================================================
// REGRESSION: Verify the retry storm no longer happens
// ===================================================================

describe("Regression: non-advancing 'Missing operations' no longer causes retry storm", () => {
  beforeEach(async () => {
    vi.setSystemTime(new Date("2024-01-01"));
    pushUpdatesCallCount = 0;
    lastPushedStrands = [];
  });

  test("makes only a few pushUpdates calls instead of 501", async () => {
    const { builder } = await buildServerWithDocumentAtRevision();
    const listenerManager = builder.listenerManager;

    const listener = createListener();
    listener.transmitter = new SwitchboardPushTransmitter(remoteUrl);

    await listenerManager?.setListener(driveId, listener);

    // Previously: 501 calls (1 + 500 retries). Now: bounded early.
    expect(pushUpdatesCallCount).toBeLessThan(10);
  }, 30_000);

  test("listenerRev advances to sync unit revision despite error response", async () => {
    const { server, builder } = await buildServerWithDocumentAtRevision();
    const listenerManager = builder.listenerManager;

    const listener = createListener();
    listener.transmitter = new SwitchboardPushTransmitter(remoteUrl);

    await listenerManager?.setListener(driveId, listener);

    const state = listenerManager?.getListenerState(
      driveId,
      listener.listenerId,
    );
    const drive = await server.getDrive(driveId);
    const driveDocSyncUnits = state?.syncUnits.getAllByDocumentId(
      drive.header.id,
    );

    expect(driveDocSyncUnits).toBeDefined();
    expect(driveDocSyncUnits!.length).toBeGreaterThan(0);
    for (const [_syncId, syncState] of driveDocSyncUnits!) {
      // Previously stuck at 0. Now advanced to match sync unit revision.
      expect(syncState.listenerRev).toBeGreaterThan(0);
    }

    expect(drive.operations.global.length).toBeGreaterThan(0);
  }, 30_000);

  test("listenerStatus is SUCCESS after graceful reconciliation", async () => {
    const { builder } = await buildServerWithDocumentAtRevision();
    const listenerManager = builder.listenerManager;

    const listener = createListener();
    listener.transmitter = new SwitchboardPushTransmitter(remoteUrl);

    await listenerManager?.setListener(driveId, listener);

    const state = listenerManager?.getListenerState(
      driveId,
      listener.listenerId,
    );
    // After advancing listenerRev, the retry finds nothing to push → SUCCESS
    expect(state?.listenerStatus).toBe("SUCCESS");
  }, 30_000);

  test("subsequent setListener does not repeat the retry storm", async () => {
    const { builder } = await buildServerWithDocumentAtRevision();
    const listenerManager = builder.listenerManager;

    const listener = createListener();
    listener.transmitter = new SwitchboardPushTransmitter(remoteUrl);
    await listenerManager?.setListener(driveId, listener);

    const firstCallCount = pushUpdatesCallCount;
    expect(firstCallCount).toBeLessThan(10);

    // Add a second listener
    pushUpdatesCallCount = 0;
    const listener2 = createListener();
    listener2.transmitter = new SwitchboardPushTransmitter(remoteUrl);
    await listenerManager?.setListener(driveId, listener2);

    // Second listener also bounded
    expect(pushUpdatesCallCount).toBeLessThan(10);
  }, 60_000);

  test("operations are still pushed to remote (loop prevention not over-applied)", async () => {
    const { builder } = await buildServerWithDocumentAtRevision();
    const listenerManager = builder.listenerManager;

    const listener = createListener();
    listener.transmitter = new SwitchboardPushTransmitter(remoteUrl);

    await listenerManager?.setListener(driveId, listener);

    // At least one push attempt is made (the listener does try to push)
    expect(pushUpdatesCallCount).toBeGreaterThan(0);
    expect(lastPushedStrands.length).toBeGreaterThan(0);
    expect(
      lastPushedStrands.some((s) => s.operations.length > 0),
    ).toBe(true);
  }, 30_000);
});

// ===================================================================
// EXPECTED BEHAVIOR AFTER FIX
// ===================================================================

describe("FIXED: SwitchboardPush listener handles 'Missing operations' gracefully", () => {
  beforeEach(async () => {
    vi.setSystemTime(new Date("2024-01-01"));
    pushUpdatesCallCount = 0;
    lastPushedStrands = [];
  });

  test("stops retrying when remote returns 'Missing operations' with non-advancing revision", async () => {
    const { builder } = await buildServerWithDocumentAtRevision();
    const listenerManager = builder.listenerManager;

    const listener = createListener();
    listener.transmitter = new SwitchboardPushTransmitter(remoteUrl);

    await listenerManager?.setListener(driveId, listener);

    // FIXED: detects non-advancing revision and advances listenerRev
    // instead of retrying 500 times. At most a few calls (initial + retry that finds nothing).
    expect(pushUpdatesCallCount).toBeLessThan(10);
  }, 30_000);

  test("listenerRev advances to sync unit revision after 'Missing operations'", async () => {
    const { server, builder } = await buildServerWithDocumentAtRevision();
    const listenerManager = builder.listenerManager;

    const listener = createListener();
    listener.transmitter = new SwitchboardPushTransmitter(remoteUrl);

    await listenerManager?.setListener(driveId, listener);

    const state = listenerManager?.getListenerState(
      driveId,
      listener.listenerId,
    );
    const drive = await server.getDrive(driveId);
    const driveDocSyncUnits = state?.syncUnits.getAllByDocumentId(
      drive.header.id,
    );

    expect(driveDocSyncUnits).toBeDefined();
    expect(driveDocSyncUnits!.length).toBeGreaterThan(0);
    for (const [_syncId, syncState] of driveDocSyncUnits!) {
      // FIXED: listenerRev is advanced past 0 (matches sync unit revision)
      expect(syncState.listenerRev).toBeGreaterThan(0);
    }
  }, 30_000);

  test("subsequent triggerUpdate does not repeat the retry storm", async () => {
    const { builder } = await buildServerWithDocumentAtRevision();
    const listenerManager = builder.listenerManager;

    const listener = createListener();
    listener.transmitter = new SwitchboardPushTransmitter(remoteUrl);

    await listenerManager?.setListener(driveId, listener);

    const firstCallCount = pushUpdatesCallCount;

    // Second listener on same drive — tests that the fix doesn't affect new listeners
    pushUpdatesCallCount = 0;
    const listener2 = createListener();
    listener2.transmitter = new SwitchboardPushTransmitter(remoteUrl);
    await listenerManager?.setListener(driveId, listener2);

    // FIXED: second listener also detects non-advancing revision and stops early
    expect(pushUpdatesCallCount).toBeLessThan(10);
    // Also verify first call was bounded
    expect(firstCallCount).toBeLessThan(10);
  }, 60_000);
});

// ===================================================================
// BASELINE: Healthy listener behavior (remote returns SUCCESS)
// ===================================================================

describe("Baseline: healthy SwitchboardPush listener", () => {
  beforeEach(async () => {
    vi.setSystemTime(new Date("2024-01-01"));
    pushUpdatesCallCount = 0;
    lastPushedStrands = [];
  });

  test("completes with few pushUpdates calls when remote returns SUCCESS", async () => {
    // Override mock to return SUCCESS with advancing revision
    const { GraphQLClient } = await import("graphql-request");
    (GraphQLClient as any).mockImplementation(() => ({
      request: vi
        .fn()
        .mockImplementation(
          (query: string, { strands }: { strands: StrandUpdate[] }) => {
            if (query.includes("mutation pushUpdates")) {
              pushUpdatesCallCount++;
              return Promise.resolve({
                pushUpdates: strands.map<ListenerRevision>(
                  ({ operations, ...strand }) => ({
                    ...strand,
                    status: "SUCCESS",
                    revision: operations.length
                      ? operations.at(-1)!.index + 1
                      : 0,
                  }),
                ),
              });
            }
            return Promise.resolve({});
          },
        ),
    }));

    const { builder } = await buildServerWithDocumentAtRevision();
    const listenerManager = builder.listenerManager;

    const listener = createListener();
    listener.transmitter = new SwitchboardPushTransmitter(remoteUrl);

    await listenerManager?.setListener(driveId, listener);

    // Healthy: only a handful of calls, no retry storm
    expect(pushUpdatesCallCount).toBeLessThan(10);

    const state = listenerManager?.getListenerState(
      driveId,
      listener.listenerId,
    );
    expect(state?.listenerStatus).toBe("SUCCESS");
  });

  test("listenerRev advances to match drive revision on SUCCESS", async () => {
    const { GraphQLClient } = await import("graphql-request");
    (GraphQLClient as any).mockImplementation(() => ({
      request: vi
        .fn()
        .mockImplementation(
          (query: string, { strands }: { strands: StrandUpdate[] }) => {
            if (query.includes("mutation pushUpdates")) {
              pushUpdatesCallCount++;
              return Promise.resolve({
                pushUpdates: strands.map<ListenerRevision>(
                  ({ operations, ...strand }) => ({
                    ...strand,
                    status: "SUCCESS",
                    revision: operations.length
                      ? operations.at(-1)!.index + 1
                      : 0,
                  }),
                ),
              });
            }
            return Promise.resolve({});
          },
        ),
    }));

    const { server, builder } = await buildServerWithDocumentAtRevision();
    const listenerManager = builder.listenerManager;

    const listener = createListener();
    listener.transmitter = new SwitchboardPushTransmitter(remoteUrl);

    await listenerManager?.setListener(driveId, listener);

    const state = listenerManager?.getListenerState(
      driveId,
      listener.listenerId,
    );
    const drive = await server.getDrive(driveId);
    const driveDocSyncUnits = state?.syncUnits.getAllByDocumentId(
      drive.header.id,
    );

    expect(driveDocSyncUnits).toBeDefined();
    expect(driveDocSyncUnits!.length).toBeGreaterThan(0);
    for (const [_syncId, syncState] of driveDocSyncUnits!) {
      // Healthy: listenerRev advances past 0
      expect(syncState.listenerRev).toBeGreaterThan(0);
    }
  });
});
