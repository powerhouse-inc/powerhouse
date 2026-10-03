import type {
  Operation,
  OperationWithContext,
} from "@powerhousedao/shared/document-model";
import { generateId, type Action } from "@powerhousedao/shared/document-model";
import { ConsoleLogger } from "document-model";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KyselyOperationIndex } from "../../../src/cache/kysely-operation-index.js";
import { DriveCollectionId } from "../../../src/cache/operation-index-types.js";
import { DEFAULT_DRIVE_CONTAINER_TYPES } from "../../../src/core/drive-container-types.js";
import type {
  BatchLoadRequest,
  BatchLoadResult,
  IReactor,
} from "../../../src/core/types.js";
import { EventBus } from "../../../src/events/event-bus.js";
import { ReactorEventTypes } from "../../../src/events/types.js";
import { JobStatus } from "../../../src/shared/types.js";
import type { GqlRequestChannel } from "../../../src/sync/channels/gql-req-channel.js";
import { GqlRequestChannelFactory } from "../../../src/sync/channels/gql-request-channel-factory.js";
import { SyncManager } from "../../../src/sync/sync-manager.js";
import type { SyncEnvelope } from "../../../src/sync/types.js";
import { PollBehavior } from "../../../src/sync/types.js";
import {
  createTestQueue,
  createTestSyncStorage,
  type TestSyncStorage,
} from "../../factories.js";
import { settledAtHead } from "../../catch-up/helpers.js";

const URL_UNDER_TEST = "https://remote.example/graphql";
const COLLECTION = DriveCollectionId.forDrive("drive-sync");
const BRANCH = "main";

type RecordedRequest = {
  query: string;
  variables: Record<string, unknown>;
};

/**
 * A GraphQL endpoint double at the network boundary. Everything inside the
 * process - factory, poll timer, channel, mailboxes, sync manager, cursor
 * storage - is the real implementation.
 */
function makeEndpoint() {
  const requests: RecordedRequest[] = [];
  let pollEnvelopes: SyncEnvelope[] = [];
  let pollAckOrdinal = 0;

  const fetchFn = vi
    .fn()
    .mockImplementation((_url: string, options: RequestInit) => {
      const body = JSON.parse(options.body as string) as RecordedRequest;
      requests.push(body);
      if (body.query.includes("touchChannel")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              data: { touchChannel: { success: true, ackOrdinal: 0 } },
            }),
        });
      }
      if (body.query.includes("pushSyncEnvelopes")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ data: { pushSyncEnvelopes: true } }),
        });
      }
      const envelopes = pollEnvelopes;
      pollEnvelopes = [];
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              pollSyncEnvelopes: {
                envelopes,
                ackOrdinal: pollAckOrdinal,
                deadLetters: [],
                hasMore: false,
              },
            },
          }),
      });
    });

  return {
    fetchFn,
    requests,
    serveEnvelopes(envelopes: SyncEnvelope[]) {
      pollEnvelopes = envelopes;
    },
    setAckOrdinal(ordinal: number) {
      pollAckOrdinal = ordinal;
    },
  };
}

/**
 * R1 backfill (docs/plans/2026-10-02-testing-policy.md): the sync manager /
 * channel seam with the real network channel. Every SyncManager test runs
 * against TestChannel or a vi.fn() factory, and every GqlRequestChannel
 * test fabricates its own consumer, so the composed inbound path (poll ->
 * envelope parsing -> inbox -> loadBatch -> ack cursor) and outbound path
 * (JOB_WRITE_READY -> outbox -> push serialization) were asserted by no
 * test. The reactor stays a recording double: that neighboring seam has
 * its real pair in two-reactor-convergence.test.ts.
 */
describe("SyncManager with a real GqlRequestChannel", () => {
  let storage: TestSyncStorage;
  let manager: SyncManager;
  let eventBus: EventBus;
  let operationIndex: KyselyOperationIndex;
  let endpoint: ReturnType<typeof makeEndpoint>;
  let loadBatchRequests: BatchLoadRequest[];

  beforeEach(async () => {
    storage = await createTestSyncStorage();
    eventBus = new EventBus();
    operationIndex = new KyselyOperationIndex(storage.db);
    endpoint = makeEndpoint();
    loadBatchRequests = [];

    const reactor = {
      load: vi.fn().mockResolvedValue({
        id: "job-single",
        status: JobStatus.READ_READY,
      }),
      loadBatch: vi
        .fn()
        .mockImplementation(
          (request: BatchLoadRequest): Promise<BatchLoadResult> => {
            loadBatchRequests.push(request);
            const jobs: BatchLoadResult["jobs"] = {};
            for (const job of request.jobs) {
              jobs[job.key] = {
                id: `uuid-${job.key}`,
                status: JobStatus.READ_READY,
              } as BatchLoadResult["jobs"][string];
            }
            return Promise.resolve({ jobs });
          },
        ),
      getJobStatus: vi
        .fn()
        .mockResolvedValue({ id: "job", status: JobStatus.READ_READY }),
    } as unknown as IReactor;

    manager = new SyncManager(
      new ConsoleLogger(["SyncManager"]),
      storage.syncRemoteStorage,
      storage.syncCursorStorage,
      storage.syncDeadLetterStorage,
      new GqlRequestChannelFactory(
        new ConsoleLogger(["GqlRequestChannel"]),
        undefined,
        createTestQueue(eventBus),
      ),
      operationIndex,
      reactor,
      eventBus,
      DEFAULT_DRIVE_CONTAINER_TYPES,
      settledAtHead(),
    );
    await manager.startup();
  });

  afterEach(async () => {
    await manager.shutdown().completed;
    await storage.db.destroy();
    await storage.cleanup();
  });

  async function addRemote(documentId: string): Promise<GqlRequestChannel> {
    await manager.add(
      "remote-gql",
      COLLECTION,
      {
        type: "gql-request",
        parameters: { url: URL_UNDER_TEST, fetchFn: endpoint.fetchFn },
      },
      { documentId: [documentId], scope: ["global"], branch: BRANCH },
      { sinceTimestampUtcMs: "0", pollBehavior: PollBehavior.Manual },
    );
    return manager.getByName("remote-gql").channel as GqlRequestChannel;
  }

  function setNameOperation(index: number, name: string): Operation {
    const timestampUtcMs = new Date(1_700_000_000_000 + index).toISOString();
    return {
      id: generateId(),
      index,
      skip: 0,
      hash: `hash-${index}`,
      timestampUtcMs,
      action: {
        id: generateId(),
        type: "SET_MODEL_NAME",
        scope: "global",
        timestampUtcMs,
        input: { name },
      } as Action,
    };
  }

  it("delivers a polled envelope to loadBatch and persists the inbox cursor", async () => {
    const documentId = generateId();
    const channel = await addRemote(documentId);

    const operation = setNameOperation(0, "from-remote");
    endpoint.serveEnvelopes([
      {
        type: "operations",
        channelMeta: { id: "chan-1" },
        key: "plan-1",
        operations: [
          {
            operation,
            context: {
              documentId,
              documentType: "powerhouse/document-model",
              scope: "global",
              branch: BRANCH,
              ordinal: 7,
            },
          },
        ],
      },
    ]);
    channel.triggerPull();

    await vi.waitFor(() => expect(loadBatchRequests).toHaveLength(1));
    const request = loadBatchRequests[0]!;
    expect(request.jobs).toHaveLength(1);
    expect(request.jobs[0]).toMatchObject({
      key: "plan-1",
      documentId,
      scope: "global",
      branch: BRANCH,
    });
    const delivered = request.jobs[0]!.operations[0]!;
    expect(delivered.action.type).toBe("SET_MODEL_NAME");
    expect(delivered.action.input).toEqual({ name: "from-remote" });
    expect(delivered.index).toBe(0);

    await vi.waitFor(async () => {
      const cursors = await storage.syncCursorStorage.list("remote-gql");
      const inbox = cursors.find((cursor) => cursor.cursorType === "inbox");
      expect(inbox?.cursorOrdinal).toBe(7);
    });
    expect(channel.inbox.items).toHaveLength(0);
  });

  it("pushes a local write as a serialized envelope and trims the outbox on ack", async () => {
    const documentId = generateId();
    const channel = await addRemote(documentId);

    const operation = setNameOperation(0, "pushed-name");
    const txn = operationIndex.start();
    txn.write([
      {
        id: operation.id,
        documentId,
        documentType: "powerhouse/document-model",
        scope: "global",
        branch: BRANCH,
        sourceRemote: "",
        index: 0,
        timestampUtcMs: operation.timestampUtcMs,
        hash: operation.hash,
        skip: 0,
        action: operation.action,
      },
    ]);
    txn.createCollection(COLLECTION.key);
    txn.addToCollection(COLLECTION.key, documentId);
    const [ordinal] = await operationIndex.commit(txn);

    const operations: OperationWithContext[] = [
      {
        operation,
        context: {
          documentId,
          documentType: "powerhouse/document-model",
          scope: "global",
          branch: BRANCH,
          ordinal: ordinal!,
          resultingState: JSON.stringify({ global: { name: "pushed-name" } }),
        },
      },
    ];
    await eventBus.emit(ReactorEventTypes.JOB_WRITE_READY, {
      jobId: "job-local-1",
      operations,
      jobMeta: { batchId: "batch-1", batchJobIds: ["job-local-1"] },
      collectionMemberships: { [documentId]: [COLLECTION.key] },
    });

    await vi.waitFor(() => {
      expect(
        endpoint.requests.some((request) =>
          request.query.includes("pushSyncEnvelopes"),
        ),
      ).toBe(true);
    });
    const push = endpoint.requests.find((request) =>
      request.query.includes("pushSyncEnvelopes"),
    )!;
    const envelopes = push.variables.envelopes as Array<{
      type: string;
      operations: Array<{
        operation: { action: { type: string; input: unknown } };
        context: Record<string, unknown>;
      }>;
    }>;
    expect(envelopes).toHaveLength(1);
    expect(envelopes[0]!.type).toBe("OPERATIONS");
    const wire = envelopes[0]!.operations[0]!;
    expect(wire.operation.action.type).toBe("SET_MODEL_NAME");
    expect(wire.operation.action.input).toEqual({ name: "pushed-name" });
    expect(wire.context).toMatchObject({
      documentId,
      scope: "global",
      branch: BRANCH,
      ordinal: ordinal!,
    });
    // serializeEnvelope strips resultingState: it is not part of
    // OperationContextInput and must never cross the wire.
    expect(wire.context).not.toHaveProperty("resultingState");

    endpoint.setAckOrdinal(ordinal!);
    channel.triggerPull();
    await vi.waitFor(() => expect(channel.outbox.items).toHaveLength(0));
    await vi.waitFor(async () => {
      const cursors = await storage.syncCursorStorage.list("remote-gql");
      const outbox = cursors.find((cursor) => cursor.cursorType === "outbox");
      expect(outbox?.cursorOrdinal).toBe(ordinal!);
    });
  });
});
