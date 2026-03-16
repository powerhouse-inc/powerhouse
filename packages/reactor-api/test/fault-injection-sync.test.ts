import {
  ConsoleLogger,
  DocumentModelRegistry,
  EventBus,
  GqlRequestChannel,
  GqlResponseChannelFactory,
  InMemoryQueue,
  NullDocumentModelResolver,
  ReactorBuilder,
  SyncBuilder,
  type GqlChannelConfig,
  type ISyncManager,
  type ReactorModule,
} from "@powerhousedao/reactor";
import { driveDocumentModelModule } from "document-drive";
import type { DocumentModelModule } from "document-model";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ManualPollTimer,
  createMockCursorStorage,
  createMockLogger,
  createMockOperationIndex,
} from "../../reactor/test/sync/channels/gql-req-channel/test-helpers.js";
import { createResolverBridge } from "./utils/gql-resolver-bridge.js";

// ---------------------------------------------------------------------------
// FaultInjector
// ---------------------------------------------------------------------------

type FaultRule =
  | { type: "http"; statusCode: number; statusText: string }
  | { type: "network"; message: string };

type OperationName = "touchChannel" | "pollSyncEnvelopes" | "pushSyncEnvelopes";

class FaultInjector {
  private faults = new Map<OperationName, FaultRule[]>();
  private readonly delegate: typeof fetch;

  constructor(delegate: typeof fetch) {
    this.delegate = delegate;
  }

  injectFault(op: OperationName, rule: FaultRule): void {
    if (!this.faults.has(op)) {
      this.faults.set(op, []);
    }
    this.faults.get(op)!.push(rule);
  }

  clearFaults(): void {
    this.faults.clear();
  }

  get fetch(): typeof fetch {
    return async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ): Promise<Response> => {
      if (!init?.body) {
        return this.delegate(input, init);
      }

      const body = JSON.parse(init.body as string) as { query: string };
      let operationName: OperationName | undefined;

      if (body.query.includes("touchChannel")) {
        operationName = "touchChannel";
      } else if (body.query.includes("pollSyncEnvelopes")) {
        operationName = "pollSyncEnvelopes";
      } else if (body.query.includes("pushSyncEnvelopes")) {
        operationName = "pushSyncEnvelopes";
      }

      if (operationName) {
        const queue = this.faults.get(operationName);
        if (queue && queue.length > 0) {
          const rule = queue.shift()!;
          if (rule.type === "http") {
            return new Response(JSON.stringify({}), {
              status: rule.statusCode,
              statusText: rule.statusText,
            });
          }
          if (rule.type === "network") {
            throw new Error(rule.message);
          }
        }
      }

      return this.delegate(input, init);
    };
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Fault-Injection Sync", () => {
  const CHANNEL_ID = "fault-test-channel";

  let serverModule: ReactorModule;
  let serverSyncManager: ISyncManager;
  let channel: GqlRequestChannel;
  let manualTimer: ManualPollTimer;
  let faultInjector: FaultInjector;

  beforeEach(async () => {
    // Build server with real timers (buildModule may use async I/O)
    const syncManagerRegistry = new Map<string, ISyncManager>();
    const resolverBridge = createResolverBridge(syncManagerRegistry, {
      log: false,
    });

    const serverEventBus = new EventBus();
    const registry = new DocumentModelRegistry();
    registry.registerModules(
      driveDocumentModelModule as unknown as DocumentModelModule,
    );
    const resolver = new NullDocumentModelResolver(registry);
    const serverQueue = new InMemoryQueue(serverEventBus, resolver);

    serverModule = await new ReactorBuilder()
      .withEventBus(serverEventBus)
      .withQueue(serverQueue)
      .withDocumentModels([
        driveDocumentModelModule as unknown as DocumentModelModule,
      ])
      .withSync(
        new SyncBuilder().withChannelFactory(
          new GqlResponseChannelFactory(new ConsoleLogger(["test"])),
        ),
      )
      .buildModule();

    serverSyncManager = serverModule.syncModule!.syncManager;
    syncManagerRegistry.set("server", serverSyncManager);

    // Switch to fake timers (recovery backoff uses setTimeout)
    vi.useFakeTimers();

    // Client setup
    faultInjector = new FaultInjector(resolverBridge);
    manualTimer = new ManualPollTimer();

    const config: GqlChannelConfig = {
      url: "http://server/graphql",
      collectionId: "test-collection",
      filter: { documentId: [], scope: [], branch: "main" },
      retryBaseDelayMs: 100,
      retryMaxDelayMs: 200,
    };

    channel = new GqlRequestChannel(
      createMockLogger(),
      CHANNEL_ID,
      "remote-1",
      createMockCursorStorage(),
      { ...config, fetchFn: faultInjector.fetch },
      createMockOperationIndex(),
      manualTimer,
    );

    await channel.init();
    expect(channel.getConnectionState().state).toBe("connected");
  });

  afterEach(async () => {
    await channel.shutdown();
    serverModule.reactor.kill();
    vi.useRealTimers();
  });

  // -----------------------------------------------------------------------
  // Test 1: Poll 401 -> stops polling (unrecoverable)
  // -----------------------------------------------------------------------
  it("poll 401 stops polling (unrecoverable)", async () => {
    faultInjector.injectFault("pollSyncEnvelopes", {
      type: "http",
      statusCode: 401,
      statusText: "Unauthorized",
    });

    await manualTimer.tick();

    expect(channel.getConnectionState().state).toBe("error");
    expect(manualTimer.isRunning()).toBe(false);
    expect(channel.getConnectionState().failureCount).toBe(1);
  });

  // -----------------------------------------------------------------------
  // Test 2: Poll 500 -> retries and recovers (recoverable)
  // -----------------------------------------------------------------------
  it("poll 500 retries and recovers on next tick", async () => {
    faultInjector.injectFault("pollSyncEnvelopes", {
      type: "http",
      statusCode: 500,
      statusText: "Internal Server Error",
    });

    // First poll: 500 error (recoverable) - rethrown by handlePollError
    await manualTimer.tick().catch(() => {});

    expect(channel.getConnectionState().state).toBe("error");
    expect(manualTimer.isRunning()).toBe(true);

    // Second poll: no faults, real resolver responds
    await manualTimer.tick();

    expect(channel.getConnectionState().state).toBe("connected");
    expect(channel.getConnectionState().failureCount).toBe(0);
  });

  // -----------------------------------------------------------------------
  // Test 3: Channel deleted -> recovery -> reconnect
  // -----------------------------------------------------------------------
  it("channel deleted triggers recovery and reconnects", async () => {
    // Delete the channel on the server
    await serverSyncManager.remove(CHANNEL_ID);

    // Poll -> resolver throws "Channel not found"
    await manualTimer.tick();

    expect(channel.getConnectionState().state).toBe("reconnecting");
    expect(manualTimer.isRunning()).toBe(false);

    // Recovery touchChannel -> real resolver recreates the channel
    await vi.advanceTimersByTimeAsync(500);

    expect(channel.getConnectionState().state).toBe("connected");
    expect(manualTimer.isRunning()).toBe(true);
  });

  // -----------------------------------------------------------------------
  // Test 4: Channel deleted + auth error on recovery -> stops
  // -----------------------------------------------------------------------
  it("channel deleted with auth error on recovery stops", async () => {
    await serverSyncManager.remove(CHANNEL_ID);

    // Queue a 403 for the recovery touchChannel
    faultInjector.injectFault("touchChannel", {
      type: "http",
      statusCode: 403,
      statusText: "Forbidden",
    });

    // Poll -> "Channel not found" -> recovery triggered
    await manualTimer.tick();
    expect(channel.getConnectionState().state).toBe("reconnecting");

    // Recovery touchChannel -> 403 (unrecoverable)
    await vi.advanceTimersByTimeAsync(500);

    expect(channel.getConnectionState().state).toBe("error");
    expect(manualTimer.isRunning()).toBe(false);
  });

  // -----------------------------------------------------------------------
  // Test 5: Channel deleted + transient error on recovery -> retries
  // -----------------------------------------------------------------------
  it("channel deleted with transient recovery error retries and succeeds", async () => {
    await serverSyncManager.remove(CHANNEL_ID);

    // Queue a network error for the first recovery touchChannel attempt
    faultInjector.injectFault("touchChannel", {
      type: "network",
      message: "Network timeout",
    });

    // Poll -> "Channel not found" -> recovery triggered
    await manualTimer.tick();
    expect(channel.getConnectionState().state).toBe("reconnecting");

    // First recovery attempt -> network error (recoverable), still reconnecting
    await vi.advanceTimersByTimeAsync(50);
    expect(channel.getConnectionState().state).toBe("reconnecting");

    // Advance past backoff delay - second recovery attempt -> real resolver succeeds
    await vi.advanceTimersByTimeAsync(500);

    expect(channel.getConnectionState().state).toBe("connected");
    expect(manualTimer.isRunning()).toBe(true);
  });
});
