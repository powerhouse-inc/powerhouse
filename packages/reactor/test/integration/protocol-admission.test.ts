import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import {
  localPeerManifest,
  withSignaturePolicy,
  type PeerCapability,
} from "@powerhousedao/shared/document-model";
import type { ILogger } from "document-model";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DriveCollectionId } from "../../src/cache/operation-index-types.js";
import { ReactorBuilder } from "../../src/core/reactor-builder.js";
import type { InProcessReactorModule, IReactor } from "../../src/core/types.js";
import { EventBus } from "../../src/events/event-bus.js";
import { JobStatus, type JobInfo } from "../../src/shared/types.js";
import type { ISyncCursorStorage } from "../../src/storage/interfaces.js";
import type { IChannelFactory } from "../../src/sync/interfaces.js";
import { SyncBuilder } from "../../src/sync/sync-builder.js";
import type { SyncEnvelope } from "../../src/sync/types.js";
import { syncOperationErrorType } from "../../src/sync/utils.js";
import { createCreateDocumentOperation } from "../factories.js";
import { TestChannel } from "../sync/channels/test-channel.js";

const DRIVE = "powerhouse/document-drive";

const BASE_REDUCER_7: PeerCapability = {
  kind: "protocol",
  name: "base-reducer",
  baseline: [1, 2],
  supported: () => [1, 2, 7],
  preferred: () => 2,
  optional: false,
};

function spyLogger(): ILogger & { info: ReturnType<typeof vi.fn> } {
  const logger = {
    level: "error",
    verbose: () => {},
    debug: () => {},
    info: vi.fn(),
    warn: () => {},
    error: () => {},
    errorHandler: () => {},
    child: () => logger,
  };
  return logger as unknown as ILogger & { info: ReturnType<typeof vi.fn> };
}

async function settled(reactor: IReactor, jobId: string): Promise<JobInfo> {
  await vi.waitUntil(
    async () => {
      const { status } = await reactor.getJobStatus(jobId);
      return status === JobStatus.READ_READY || status === JobStatus.FAILED;
    },
    { timeout: 10_000, interval: 5 },
  );
  return reactor.getJobStatus(jobId);
}

function driveAt(protocolVersions: Record<string, number>, id: string) {
  return withSignaturePolicy(
    driveDocumentModelModule.utils.createDocument(),
    "legacy",
    { id, protocolVersions },
  );
}

describe("protocol admission", () => {
  const reactors: IReactor[] = [];

  afterEach(() => {
    for (const reactor of reactors.splice(0)) {
      reactor.kill();
    }
  });

  async function build(
    configure: (builder: ReactorBuilder) => ReactorBuilder = (b) => b,
  ): Promise<InProcessReactorModule> {
    const module = await configure(
      new ReactorBuilder().withDocumentModelSources([
        driveDocumentModelModule as never,
      ]),
    ).buildModule();
    reactors.push(module.reactor);
    return module;
  }

  it("refuses a create at base-reducer 7 and names the refusal", async () => {
    const { reactor } = await build();

    const info = await reactor.create(driveAt({ "base-reducer": 7 }, "br7"));
    const job = await settled(reactor, info.id);

    expect(job.status).toBe(JobStatus.FAILED);
    expect(job.error?.name).toBe("UnsupportedProtocolVersionError");
    await expect(reactor.get("br7")).rejects.toThrow();
  });

  it("refuses a load of a base-reducer 7 creation", async () => {
    const { reactor } = await build();

    const create = createCreateDocumentOperation(
      "br7-load",
      DRIVE,
      {},
      { protocolVersions: { "base-reducer": 7 } },
    );
    const info = await reactor.load("br7-load", "main", [create]);
    const job = await settled(reactor, info.id);

    expect(job.status).toBe(JobStatus.FAILED);
    expect(job.error?.name).toBe("UnsupportedProtocolVersionError");
  });

  it("runs base-reducer 7 once a capability registers it", async () => {
    const { reactor } = await build((b) =>
      b.withPeerCapabilities([BASE_REDUCER_7]),
    );

    const info = await reactor.create(driveAt({ "base-reducer": 7 }, "br7-ok"));

    expect((await settled(reactor, info.id)).status).toBe(JobStatus.READ_READY);
  });

  it("admits and logs a key no capability registers", async () => {
    const logger = spyLogger();
    const { reactor } = await build((b) => b.withLogger(logger));

    const info = await reactor.create(
      driveAt({ "base-reducer": 2, "app-custom": 4 }, "custom"),
    );

    expect((await settled(reactor, info.id)).status).toBe(JobStatus.READ_READY);
    expect(
      logger.info.mock.calls.some(
        (call) =>
          String(call[0]).includes("unregistered protocol") &&
          call.includes("app-custom"),
      ),
    ).toBe(true);
  });

  it("dead-letters a document its peer claimed but cannot run as UNSUPPORTED_PROTOCOL, without quarantine", async () => {
    const channels = new Map<string, TestChannel>();
    const peers = new Map([
      ["toB", "toA"],
      ["toA", "toB"],
    ]);
    const channelFactory: IChannelFactory = {
      instance(
        remoteId: string,
        remoteName: string,
        _config: unknown,
        cursorStorage: ISyncCursorStorage,
      ): TestChannel {
        const channel = new TestChannel(
          remoteId,
          remoteName,
          cursorStorage,
          (envelope: SyncEnvelope) =>
            channels.get(peers.get(remoteName)!)!.receive(envelope),
          {
            peer: () => channels.get(peers.get(remoteName)!),
            // B claims base-reducer 7 without running it.
            announce:
              remoteName === "toA"
                ? () => localPeerManifest([BASE_REDUCER_7], {})
                : undefined,
          },
        );
        channels.set(remoteName, channel);
        return channel;
      },
    } as IChannelFactory;

    const withSync = (b: ReactorBuilder) =>
      b
        .withEventBus(new EventBus())
        .withSync(new SyncBuilder().withChannelFactory(channelFactory));
    const a = await build((b) =>
      withSync(b).withPeerCapabilities([BASE_REDUCER_7]),
    );
    const b = await build(withSync);

    const filter = { documentId: [], scope: [], branch: "main" };
    for (const [module, name] of [
      [a, "toB"],
      [b, "toA"],
    ] as const) {
      await module.syncModule!.syncManager.add(
        name,
        DriveCollectionId.forDrive("shared-drive"),
        { type: "internal", parameters: {} },
        filter,
      );
    }

    const info = await a.reactor.create(
      driveAt({ "base-reducer": 7 }, "shared-drive"),
    );
    expect((await settled(a.reactor, info.id)).status).toBe(
      JobStatus.READ_READY,
    );

    const deadLetters = channels.get("toA")!.deadLetter;
    await vi.waitUntil(() => deadLetters.items.length > 0, { timeout: 10_000 });

    expect(syncOperationErrorType(deadLetters.items[0].error)).toBe(
      "UNSUPPORTED_PROTOCOL",
    );
    const stored =
      await b.syncModule!.deadLetterStorage.listQuarantinedDocumentIds();
    expect(stored).not.toContain("shared-drive");
  });
});
