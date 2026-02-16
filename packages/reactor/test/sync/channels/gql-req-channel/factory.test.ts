import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IOperationIndex } from "../../../../src/cache/operation-index-types.js";
import type { IQueue } from "../../../../src/queue/interfaces.js";
import type { ISyncCursorStorage } from "../../../../src/storage/interfaces.js";
import { GqlRequestChannel } from "../../../../src/sync/channels/gql-req-channel.js";
import { GqlRequestChannelFactory } from "../../../../src/sync/channels/gql-request-channel-factory.js";
import type {
  ChannelConfig,
  RemoteFilter,
} from "../../../../src/sync/types.js";
import { createMockLogger } from "../../../factories.js";

const TEST_COLLECTION_ID = "test-collection";
const TEST_FILTER: RemoteFilter = {
  documentId: [],
  scope: [],
  branch: "main",
};

const createMockQueue = (): IQueue =>
  ({
    totalSize: vi.fn().mockResolvedValue(0),
  }) as unknown as IQueue;

const createMockCursorStorage = (): ISyncCursorStorage => ({
  list: vi.fn(),
  get: vi.fn().mockResolvedValue(null),
  upsert: vi.fn().mockResolvedValue(undefined),
  remove: vi.fn().mockResolvedValue(undefined),
});

const createMockFetch = () => {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ data: { pollSyncEnvelopes: [] } }),
  });
};

const createMockOperationIndex = (): IOperationIndex => ({
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

describe("GqlRequestChannelFactory", () => {
  let originalFetch: typeof global.fetch;
  let factory: GqlRequestChannelFactory;

  beforeEach(() => {
    originalFetch = global.fetch;
    vi.useFakeTimers();

    factory = new GqlRequestChannelFactory(
      createMockLogger(),
      undefined,
      createMockQueue(),
    );
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe("instance creation", () => {
    it("should create GqlChannel with valid config", async () => {
      const cursorStorage = createMockCursorStorage();
      const mockFetch = createMockFetch();
      global.fetch = mockFetch;

      const config: ChannelConfig = {
        type: "gql",
        parameters: {
          url: "https://example.com/graphql",
        },
      };

      const channel = factory.instance(
        "test-id",
        "test-remote",
        config,
        cursorStorage,
        TEST_COLLECTION_ID,
        TEST_FILTER,
        createMockOperationIndex(),
      );

      expect(channel).toBeInstanceOf(GqlRequestChannel);
      expect(channel.inbox.items).toHaveLength(0);
      expect(channel.outbox.items).toHaveLength(0);
      expect(channel.deadLetter.items).toHaveLength(0);

      await channel.shutdown();
    });

    it("should pass all optional parameters to GqlChannel", async () => {
      const cursorStorage = createMockCursorStorage();
      const mockFetch = createMockFetch();
      global.fetch = mockFetch;

      const config: ChannelConfig = {
        type: "gql",
        parameters: {
          url: "https://example.com/graphql",
          authToken: "test-token",
          pollIntervalMs: 3000,
          retryBaseDelayMs: 500,
          retryMaxDelayMs: 10000,
        },
      };

      const channel = factory.instance(
        "test-id",
        "test-remote",
        config,
        cursorStorage,
        TEST_COLLECTION_ID,
        TEST_FILTER,
        createMockOperationIndex(),
      );

      expect(channel).toBeInstanceOf(GqlRequestChannel);
      await channel.shutdown();
    });

    it("should work with minimal config (url only)", async () => {
      const cursorStorage = createMockCursorStorage();
      const mockFetch = createMockFetch();
      global.fetch = mockFetch;

      const config: ChannelConfig = {
        type: "gql",
        parameters: {
          url: "https://example.com/graphql",
        },
      };

      const channel = factory.instance(
        "test-id",
        "test-remote",
        config,
        cursorStorage,
        TEST_COLLECTION_ID,
        TEST_FILTER,
        createMockOperationIndex(),
      );

      expect(channel).toBeInstanceOf(GqlRequestChannel);
      await channel.shutdown();
    });
  });

  describe("validation", () => {
    it("should throw error if url is missing", () => {
      const cursorStorage = createMockCursorStorage();

      const config: ChannelConfig = {
        type: "gql",
        parameters: {},
      };

      expect(() =>
        factory.instance(
          "test-id",
          "test-remote",
          config,
          cursorStorage,
          TEST_COLLECTION_ID,
          TEST_FILTER,
          createMockOperationIndex(),
        ),
      ).toThrow(
        'GqlRequestChannelFactory requires "url" parameter in config.parameters',
      );
    });

    it("should throw error if url is empty string", () => {
      const cursorStorage = createMockCursorStorage();

      const config: ChannelConfig = {
        type: "gql",
        parameters: {
          url: "",
        },
      };

      expect(() =>
        factory.instance(
          "test-id",
          "test-remote",
          config,
          cursorStorage,
          TEST_COLLECTION_ID,
          TEST_FILTER,
          createMockOperationIndex(),
        ),
      ).toThrow(
        'GqlRequestChannelFactory requires "url" parameter in config.parameters',
      );
    });

    it("should throw error if url is not a string", () => {
      const cursorStorage = createMockCursorStorage();

      const config: ChannelConfig = {
        type: "gql",
        parameters: {
          url: 123 as any,
        },
      };

      expect(() =>
        factory.instance(
          "test-id",
          "test-remote",
          config,
          cursorStorage,
          TEST_COLLECTION_ID,
          TEST_FILTER,
          createMockOperationIndex(),
        ),
      ).toThrow(
        'GqlRequestChannelFactory requires "url" parameter in config.parameters',
      );
    });

    it("should throw error if pollIntervalMs is not a number", () => {
      const cursorStorage = createMockCursorStorage();

      const config: ChannelConfig = {
        type: "gql",
        parameters: {
          url: "https://example.com/graphql",
          pollIntervalMs: "3000" as any,
        },
      };

      expect(() =>
        factory.instance(
          "test-id",
          "test-remote",
          config,
          cursorStorage,
          TEST_COLLECTION_ID,
          TEST_FILTER,
          createMockOperationIndex(),
        ),
      ).toThrow('"pollIntervalMs" parameter must be a number');
    });

    it("should throw error if retryBaseDelayMs is not a number", () => {
      const cursorStorage = createMockCursorStorage();

      const config: ChannelConfig = {
        type: "gql",
        parameters: {
          url: "https://example.com/graphql",
          retryBaseDelayMs: "1000" as any,
        },
      };

      expect(() =>
        factory.instance(
          "test-id",
          "test-remote",
          config,
          cursorStorage,
          TEST_COLLECTION_ID,
          TEST_FILTER,
          createMockOperationIndex(),
        ),
      ).toThrow('"retryBaseDelayMs" parameter must be a number');
    });

    it("should throw error if retryMaxDelayMs is not a number", () => {
      const cursorStorage = createMockCursorStorage();

      const config: ChannelConfig = {
        type: "gql",
        parameters: {
          url: "https://example.com/graphql",
          retryMaxDelayMs: "300000" as any,
        },
      };

      expect(() =>
        factory.instance(
          "test-id",
          "test-remote",
          config,
          cursorStorage,
          TEST_COLLECTION_ID,
          TEST_FILTER,
          createMockOperationIndex(),
        ),
      ).toThrow('"retryMaxDelayMs" parameter must be a number');
    });
  });

  describe("multiple instances", () => {
    it("should create multiple independent channels", async () => {
      const cursorStorage1 = createMockCursorStorage();
      const cursorStorage2 = createMockCursorStorage();
      const mockFetch = createMockFetch();
      global.fetch = mockFetch;

      const config1: ChannelConfig = {
        type: "gql",
        parameters: {
          url: "https://reactor1.com/graphql",
        },
      };

      const config2: ChannelConfig = {
        type: "gql",
        parameters: {
          url: "https://reactor2.com/graphql",
          authToken: "token-2",
        },
      };

      const channel1 = factory.instance(
        "id-1",
        "remote-1",
        config1,
        cursorStorage1,
        TEST_COLLECTION_ID,
        TEST_FILTER,
        createMockOperationIndex(),
      );
      const channel2 = factory.instance(
        "id-2",
        "remote-2",
        config2,
        cursorStorage2,
        TEST_COLLECTION_ID,
        TEST_FILTER,
        createMockOperationIndex(),
      );

      expect(channel1).toBeInstanceOf(GqlRequestChannel);
      expect(channel2).toBeInstanceOf(GqlRequestChannel);
      expect(channel1).not.toBe(channel2);

      await channel1.shutdown();
      await channel2.shutdown();
    });
  });

  describe("parameter extraction", () => {
    it("should handle undefined optional parameters", async () => {
      const cursorStorage = createMockCursorStorage();
      const mockFetch = createMockFetch();
      global.fetch = mockFetch;

      const config: ChannelConfig = {
        type: "gql",
        parameters: {
          url: "https://example.com/graphql",
          authToken: undefined,
          pollIntervalMs: undefined,
        },
      };

      const channel = factory.instance(
        "test-id",
        "test-remote",
        config,
        cursorStorage,
        TEST_COLLECTION_ID,
        TEST_FILTER,
        createMockOperationIndex(),
      );

      expect(channel).toBeInstanceOf(GqlRequestChannel);
      await channel.shutdown();
    });

    it("should accept extra unrecognized parameters without error", async () => {
      const cursorStorage = createMockCursorStorage();
      const mockFetch = createMockFetch();
      global.fetch = mockFetch;

      const config: ChannelConfig = {
        type: "gql",
        parameters: {
          url: "https://example.com/graphql",
          extraParam: "should-be-ignored",
          anotherParam: 123,
        },
      };

      const channel = factory.instance(
        "test-id",
        "test-remote",
        config,
        cursorStorage,
        TEST_COLLECTION_ID,
        TEST_FILTER,
        createMockOperationIndex(),
      );

      expect(channel).toBeInstanceOf(GqlRequestChannel);
      await channel.shutdown();
    });
  });
});
