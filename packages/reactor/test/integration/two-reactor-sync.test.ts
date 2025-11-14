import { driveDocumentModelModule } from "document-drive";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ReactorBuilder } from "../../src/core/reactor-builder.js";
import type { IReactor } from "../../src/core/types.js";
import { JobStatus } from "../../src/shared/types.js";
import type { ISyncCursorStorage } from "../../src/storage/interfaces.js";
import { InternalChannel } from "../../src/sync/channels/internal-channel.js";
import type { IChannelFactory } from "../../src/sync/interfaces.js";
import { SyncBuilder } from "../../src/sync/sync-builder.js";
import type { ChannelConfig, SyncEnvelope } from "../../src/sync/types.js";

type TwoReactorSetup = {
  reactorA: IReactor;
  reactorB: IReactor;
  channelRegistry: Map<string, InternalChannel>;
};

async function waitForJobCompletion(
  reactor: IReactor,
  jobId: string,
  timeoutMs = 2000,
): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const status = await reactor.getJobStatus(jobId);

    if (status.status === JobStatus.COMPLETED) {
      return;
    }

    if (status.status === JobStatus.FAILED) {
      throw new Error(`Job failed: ${status.error?.message || "Unknown"}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error(`Job did not complete within ${timeoutMs}ms`);
}

async function waitForOperationsToSync(
  reactor: IReactor,
  documentId: string,
  expectedCount: number,
  timeoutMs = 2000,
): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    try {
      const result = await reactor.getOperations(documentId, {
        branch: "main",
      });

      const ops = Object.values(result).flatMap((scope) => scope.results);

      if (ops.length >= expectedCount) {
        return;
      }
    } catch {
      // Document might not exist yet
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(
    `Operations did not sync to reactor within ${timeoutMs}ms. Expected ${expectedCount} operations for document ${documentId}`,
  );
}

async function setupTwoReactors(): Promise<TwoReactorSetup> {
  const channelRegistry = new Map<string, InternalChannel>();
  const peerMapping = new Map<string, string>();
  peerMapping.set("remoteA", "remoteB");
  peerMapping.set("remoteB", "remoteA");

  const createChannelFactory = (): IChannelFactory => {
    return {
      instance(
        config: ChannelConfig,
        cursorStorage: ISyncCursorStorage,
      ): InternalChannel {
        const remoteName = config.remoteName;
        const peerName = peerMapping.get(remoteName);

        const send = (envelope: SyncEnvelope): void => {
          const peerChannel = peerName
            ? channelRegistry.get(peerName)
            : undefined;
          if (!peerChannel) {
            throw new Error(
              `Peer channel '${peerName}' not found in registry for remote '${remoteName}'`,
            );
          }
          peerChannel.receive(envelope);
        };

        const channel = new InternalChannel(
          config.channelId,
          config.remoteName,
          cursorStorage,
          send,
        );

        channelRegistry.set(remoteName, channel);

        return channel;
      },
    };
  };

  const reactorA = await new ReactorBuilder()
    .withSync(new SyncBuilder().withChannelFactory(createChannelFactory()))
    .build();

  const reactorB = await new ReactorBuilder()
    .withSync(new SyncBuilder().withChannelFactory(createChannelFactory()))
    .build();

  await reactorA.syncManager!.add(
    "remoteB",
    "collection1",
    {
      type: "internal",
      channelId: "channelB",
      remoteName: "remoteB",
      parameters: {},
    },
    {
      documentId: [],
      scope: [],
      branch: "main",
    },
  );

  await reactorB.syncManager!.add(
    "remoteA",
    "collection1",
    {
      type: "internal",
      channelId: "channelA",
      remoteName: "remoteA",
      parameters: {},
    },
    {
      documentId: [],
      scope: [],
      branch: "main",
    },
  );

  return { reactorA, reactorB, channelRegistry };
}

describe("Two-Reactor Sync Integration", () => {
  let reactorA: IReactor;
  let reactorB: IReactor;

  beforeEach(async () => {
    const setup = await setupTwoReactors();
    reactorA = setup.reactorA;
    reactorB = setup.reactorB;
  });

  afterEach(() => {
    reactorA.kill();
    reactorB.kill();
  });

  it("should sync operation from ReactorA to ReactorB", async () => {
    const document = driveDocumentModelModule.utils.createDocument();
    const jobInfo = await reactorA.create(document);

    await waitForJobCompletion(reactorA, jobInfo.id);

    const resultA = await reactorA.getOperations(document.header.id, {
      branch: "main",
    });
    const opsA = Object.values(resultA).flatMap((scope) => scope.results);

    await waitForOperationsToSync(reactorB, document.header.id, opsA.length);

    const resultB = await reactorB.getOperations(document.header.id, {
      branch: "main",
    });
    const opsB = Object.values(resultB).flatMap((scope) => scope.results);

    expect(opsA.length).toBeGreaterThan(0);
    expect(opsB.length).toBe(opsA.length);

    for (let i = 0; i < opsA.length; i++) {
      expect(opsB[i]).toEqual(opsA[i]);
    }

    const docA = await reactorA.get(document.header.id, { branch: "main" });
    const docB = await reactorB.get(document.header.id, { branch: "main" });

    expect(docA.document).toEqual(docB.document);
  });

  it("should sync operation from ReactorB to ReactorA", async () => {
    const document = driveDocumentModelModule.utils.createDocument();
    const jobInfo = await reactorB.create(document);

    await waitForJobCompletion(reactorB, jobInfo.id);

    const resultB = await reactorB.getOperations(document.header.id, {
      branch: "main",
    });
    const opsB = Object.values(resultB).flatMap((scope) => scope.results);

    await waitForOperationsToSync(reactorA, document.header.id, opsB.length);

    const resultA = await reactorA.getOperations(document.header.id, {
      branch: "main",
    });
    const opsA = Object.values(resultA).flatMap((scope) => scope.results);

    expect(opsB.length).toBeGreaterThan(0);
    expect(opsA.length).toBe(opsB.length);

    for (let i = 0; i < opsB.length; i++) {
      expect(opsA[i]).toEqual(opsB[i]);
    }

    const docA = await reactorA.get(document.header.id, { branch: "main" });
    const docB = await reactorB.get(document.header.id, { branch: "main" });

    expect(docA.document).toEqual(docB.document);
  });
});
