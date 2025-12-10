import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ISyncCursorStorage } from "../../../../src/storage/interfaces.js";
import { GqlChannelFactory } from "../../../../src/sync/channels/gql-channel-factory.js";
import { GqlChannel } from "../../../../src/sync/channels/gql-channel.js";
import type {
  ChannelConfig,
  RemoteFilter,
} from "../../../../src/sync/types.js";

const TEST_COLLECTION_ID = "test-collection";
const TEST_FILTER: RemoteFilter = {
  documentId: [],
  scope: [],
  branch: "main",
};

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

describe("GqlChannelFactory", () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    vi.useFakeTimers();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe("instance creation", () => {
    it("should create GqlChannel with valid config", () => {
      const factory = new GqlChannelFactory();
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
      );

      expect(channel).toBeInstanceOf(GqlChannel);
      expect(channel.inbox.items).toHaveLength(0);
      expect(channel.outbox.items).toHaveLength(0);
      expect(channel.deadLetter.items).toHaveLength(0);

      channel.shutdown();
    });

    it("should pass all optional parameters to GqlChannel", () => {
      const factory = new GqlChannelFactory();
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
          maxFailures: 3,
        },
      };

      const channel = factory.instance(
        "test-id",
        "test-remote",
        config,
        cursorStorage,
        TEST_COLLECTION_ID,
        TEST_FILTER,
      );

      expect(channel).toBeInstanceOf(GqlChannel);
      channel.shutdown();
    });

    it("should work with minimal config (url only)", () => {
      const factory = new GqlChannelFactory();
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
      );

      expect(channel).toBeInstanceOf(GqlChannel);
      channel.shutdown();
    });
  });

  describe("validation", () => {
    it("should throw error if type is not gql", () => {
      const factory = new GqlChannelFactory();
      const cursorStorage = createMockCursorStorage();

      const config: ChannelConfig = {
        type: "internal",
        parameters: {
          url: "https://example.com/graphql",
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
        ),
      ).toThrow(
        'GqlChannelFactory can only create channels of type "gql", got "internal"',
      );
    });

    it("should throw error if url is missing", () => {
      const factory = new GqlChannelFactory();
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
        ),
      ).toThrow(
        'GqlChannelFactory requires "url" parameter in config.parameters',
      );
    });

    it("should throw error if url is empty string", () => {
      const factory = new GqlChannelFactory();
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
        ),
      ).toThrow(
        'GqlChannelFactory requires "url" parameter in config.parameters',
      );
    });

    it("should throw error if url is not a string", () => {
      const factory = new GqlChannelFactory();
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
        ),
      ).toThrow(
        'GqlChannelFactory requires "url" parameter in config.parameters',
      );
    });

    it("should throw error if authToken is not a string", () => {
      const factory = new GqlChannelFactory();
      const cursorStorage = createMockCursorStorage();

      const config: ChannelConfig = {
        type: "gql",
        parameters: {
          url: "https://example.com/graphql",
          authToken: 123 as any,
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
        ),
      ).toThrow('"authToken" parameter must be a string');
    });

    it("should throw error if pollIntervalMs is not a number", () => {
      const factory = new GqlChannelFactory();
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
        ),
      ).toThrow('"pollIntervalMs" parameter must be a number');
    });

    it("should throw error if retryBaseDelayMs is not a number", () => {
      const factory = new GqlChannelFactory();
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
        ),
      ).toThrow('"retryBaseDelayMs" parameter must be a number');
    });

    it("should throw error if retryMaxDelayMs is not a number", () => {
      const factory = new GqlChannelFactory();
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
        ),
      ).toThrow('"retryMaxDelayMs" parameter must be a number');
    });

    it("should throw error if maxFailures is not a number", () => {
      const factory = new GqlChannelFactory();
      const cursorStorage = createMockCursorStorage();

      const config: ChannelConfig = {
        type: "gql",
        parameters: {
          url: "https://example.com/graphql",
          maxFailures: "5" as any,
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
        ),
      ).toThrow('"maxFailures" parameter must be a number');
    });
  });

  describe("multiple instances", () => {
    it("should create multiple independent channels", () => {
      const factory = new GqlChannelFactory();
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
      );
      const channel2 = factory.instance(
        "id-2",
        "remote-2",
        config2,
        cursorStorage2,
        TEST_COLLECTION_ID,
        TEST_FILTER,
      );

      expect(channel1).toBeInstanceOf(GqlChannel);
      expect(channel2).toBeInstanceOf(GqlChannel);
      expect(channel1).not.toBe(channel2);

      channel1.shutdown();
      channel2.shutdown();
    });
  });

  describe("parameter extraction", () => {
    it("should handle undefined optional parameters", () => {
      const factory = new GqlChannelFactory();
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
      );

      expect(channel).toBeInstanceOf(GqlChannel);
      channel.shutdown();
    });

    it("should accept extra unrecognized parameters without error", () => {
      const factory = new GqlChannelFactory();
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
      );

      expect(channel).toBeInstanceOf(GqlChannel);
      channel.shutdown();
    });
  });
});
