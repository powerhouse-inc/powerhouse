import type { OperationContext } from "@powerhousedao/shared/document-model";
import { vi } from "vitest";
import type { IOperationIndex } from "../../../../src/cache/operation-index-types.js";
import type { ISyncCursorStorage } from "../../../../src/storage/interfaces.js";
import type { GqlChannelConfig } from "../../../../src/sync/channels/gql-req-channel.js";
import type { IPollTimer } from "../../../../src/sync/channels/poll-timer.js";
import { SyncOperation } from "../../../../src/sync/sync-operation.js";
import type { RemoteFilter } from "../../../../src/sync/types.js";
import { createMockLogger } from "../../../factories.js";

export { createMockLogger };

export class ManualPollTimer implements IPollTimer {
  private delegate: (() => Promise<void>) | undefined;
  private running = false;
  private readonly autoFire: boolean;

  constructor(autoFire = false) {
    this.autoFire = autoFire;
  }

  setDelegate(delegate: () => Promise<void>): void {
    this.delegate = delegate;
  }

  start(): void {
    this.running = true;
    if (this.autoFire && this.delegate) {
      void this.delegate().catch(() => {});
    }
  }

  stop(): void {
    this.running = false;
  }

  async tick(): Promise<void> {
    if (this.running && this.delegate) {
      await this.delegate();
    }
  }

  isRunning(): boolean {
    return this.running;
  }
}

export const TEST_FILTER: RemoteFilter = {
  documentId: [],
  scope: [],
  branch: "main",
};

export const createTestConfig = (
  overrides: Partial<GqlChannelConfig> = {},
): GqlChannelConfig => ({
  url: "https://example.com/graphql",
  collectionId: "test-collection",
  filter: TEST_FILTER,
  retryBaseDelayMs: 1000,
  retryMaxDelayMs: 300000,
  ...overrides,
});

export const createMockCursorStorage = (
  remoteName = "remote-1",
): ISyncCursorStorage => ({
  list: vi.fn().mockResolvedValue([]),
  get: vi.fn().mockResolvedValue({
    remoteName,
    cursorType: "inbox",
    cursorOrdinal: 0,
  }),
  upsert: vi.fn().mockResolvedValue(undefined),
  remove: vi.fn().mockResolvedValue(undefined),
});

export const createMockOperationIndex = (): IOperationIndex => ({
  start: vi.fn(),
  commit: vi.fn().mockResolvedValue([]),
  find: vi
    .fn()
    .mockResolvedValue({ items: [], nextCursor: undefined, hasMore: false }),
  get: vi
    .fn()
    .mockResolvedValue({ results: [], options: { cursor: "0", limit: 100 } }),
  getSinceOrdinal: vi
    .fn()
    .mockResolvedValue({ items: [], nextCursor: undefined, hasMore: false }),
  getLatestTimestampForCollection: vi.fn().mockResolvedValue(null),
  getCollectionsForDocuments: vi.fn().mockResolvedValue({}),
});

export const createMockOperationContext = (
  ordinal: number = 1,
): OperationContext => ({
  documentId: "doc-1",
  documentType: "test/document",
  scope: "public",
  branch: "main",
  ordinal,
});

export const createMockSyncOperation = (
  id: string,
  remoteName: string,
  ordinal: number = 0,
  documentId: string = "doc-1",
): SyncOperation => {
  return new SyncOperation(
    id,
    "",
    [],
    remoteName,
    documentId,
    ["public"],
    "main",
    [
      {
        operation: {
          index: 0,
          skip: 0,
          id: "op-1",
          timestampUtcMs: new Date().toISOString(),
          hash: "hash-1",
          action: {
            type: "TEST_OP",
            id: "action-1",
            scope: "public",
            timestampUtcMs: new Date().toISOString(),
            input: {},
          },
        },
        context: { ...createMockOperationContext(ordinal), documentId },
      },
    ],
  );
};

export function createMockFetch(
  handler: (body: { query: string }) => {
    ok: boolean;
    json: () => Promise<unknown>;
  },
) {
  return vi.fn().mockImplementation((_url: string, options: RequestInit) => {
    const body = JSON.parse(options.body as string) as { query: string };
    return Promise.resolve(handler(body));
  });
}

export function successFetch() {
  return createMockFetch((body) => {
    if (body.query.includes("touchChannel")) {
      return {
        ok: true,
        json: () =>
          Promise.resolve({
            data: { touchChannel: { success: true, ackOrdinal: 0 } },
          }),
      };
    }
    if (body.query.includes("pushSyncEnvelopes")) {
      return {
        ok: true,
        json: () => Promise.resolve({ data: { pushSyncEnvelopes: true } }),
      };
    }
    return {
      ok: true,
      json: () =>
        Promise.resolve({
          data: {
            pollSyncEnvelopes: {
              envelopes: [],
              ackOrdinal: 0,
              deadLetters: [],
            },
          },
        }),
    };
  });
}
