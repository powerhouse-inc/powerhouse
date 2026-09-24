import {
  driveDocumentModelModule,
  type DocumentDriveDocument,
} from "@powerhousedao/shared/document-drive";
import {
  isDerivedDocumentId,
  signaturePolicyOf,
  type ISigner,
} from "@powerhousedao/shared/document-model";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DriveCollectionId } from "../../src/cache/operation-index-types.js";
import type { ReactorClient } from "../../src/client/reactor-client.js";
import { ReactorBuilder } from "../../src/core/reactor-builder.js";
import { ReactorClientBuilder } from "../../src/core/reactor-client-builder.js";
import type { IReactor, ReactorModule } from "../../src/core/types.js";
import { JobStatus } from "../../src/shared/types.js";
import type { ISyncCursorStorage } from "../../src/storage/interfaces.js";
import type { IChannelFactory } from "../../src/sync/interfaces.js";
import { SyncBuilder } from "../../src/sync/sync-builder.js";
import type { ChannelConfig, SyncEnvelope } from "../../src/sync/types.js";
import { TestP256Signer } from "../utils/p256-signer.js";
import { TestChannel } from "./channels/test-channel.js";

/**
 * A fleet mid-rollout: peer B still creates legacy documents, peer A creates
 * v2-required ones. B has to take A's documents as they are.
 */
type Peer = {
  client: ReactorClient;
  reactor: IReactor;
  module: ReactorModule;
  signer: ISigner;
};

describe("a peer creating legacy documents", () => {
  let peerMapping: Map<string, string>;
  let a: Peer;
  let b: Peer;

  beforeEach(async () => {
    const channels = new Map<string, TestChannel>();
    peerMapping = new Map();
    const channelFactory = (): IChannelFactory => ({
      instance(
        remoteId: string,
        remoteName: string,
        _config: ChannelConfig,
        cursorStorage: ISyncCursorStorage,
      ): TestChannel {
        const send = (envelope: SyncEnvelope): void => {
          const peerName = peerMapping.get(remoteName);
          const peer = peerName ? channels.get(peerName) : undefined;
          if (!peer) {
            throw new Error(`peer channel for '${remoteName}' is missing`);
          }
          peer.receive(envelope);
        };
        const channel = new TestChannel(
          remoteId,
          remoteName,
          cursorStorage,
          send,
        );
        channels.set(remoteName, channel);
        return channel;
      },
    });
    const build = async (legacy: boolean): Promise<Peer> => {
      const signer = (await TestP256Signer.create()).asISigner();
      const builder = new ReactorClientBuilder()
        .withReactorBuilder(
          new ReactorBuilder()
            .withDocumentModelSources([driveDocumentModelModule as never])
            .withSync(new SyncBuilder().withChannelFactory(channelFactory())),
        )
        .withSigner(signer);
      if (legacy) {
        builder.withCreateSignaturePolicy("legacy");
      }
      const built = await builder.buildModule();
      return {
        client: built.client,
        reactor: built.reactor,
        module: built.reactorModule!,
        signer,
      };
    };
    a = await build(false);
    b = await build(true);
  });

  afterEach(() => {
    a.reactor.kill();
    b.reactor.kill();
  });

  async function connect(id: string): Promise<void> {
    const filter = { documentId: [], scope: [], branch: "main" };
    peerMapping.set(`toB-${id}`, `toA-${id}`);
    peerMapping.set(`toA-${id}`, `toB-${id}`);
    const collectionId = DriveCollectionId.forDrive(id);
    await a.module.syncModule!.syncManager.add(
      `toB-${id}`,
      collectionId,
      { type: "internal", parameters: {} },
      filter,
    );
    await b.module.syncModule!.syncManager.add(
      `toA-${id}`,
      collectionId,
      { type: "internal", parameters: {} },
      filter,
    );
  }

  async function eventually<T>(read: () => Promise<T>): Promise<T> {
    const deadline = Date.now() + 20_000;
    for (;;) {
      try {
        return await read();
      } catch (error) {
        if (Date.now() > deadline) {
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }
  }

  it("admits a v2-required document another peer created, and writes to it signed", async () => {
    const drive = driveDocumentModelModule.utils.createDocument();
    const id = drive.header.id;
    expect(signaturePolicyOf(drive.header)).toBe("v2-required");
    await connect(id);

    await a.client.create(drive);
    const received = await eventually(() => b.client.get(id));
    expect(received.header.protocolVersions).toEqual(
      drive.header.protocolVersions,
    );

    const written = await b.client.execute<DocumentDriveDocument>(id, "main", [
      driveDocumentModelModule.actions.setDriveName({ name: "From B" }),
    ]);
    expect(written.state.global.name).toBe("From B");
    await eventually(async () => {
      const seen = await a.client.get<DocumentDriveDocument>(id);
      const name = seen.state.global.name;
      if (name !== "From B") {
        throw new Error(`A still sees ${name}`);
      }
      return seen;
    });

    const unsigned = await b.reactor.execute(id, "main", [
      driveDocumentModelModule.actions.setDriveName({ name: "Unsigned" }),
    ]);
    const settled = await eventually(async () => {
      const status = await b.reactor.getJobStatus(unsigned.id);
      if (
        status.status !== JobStatus.FAILED &&
        status.status !== JobStatus.READ_READY
      ) {
        throw new Error("pending");
      }
      return status;
    });
    expect(settled.status).toBe(JobStatus.FAILED);
    expect(settled.error?.message).toContain("UNSIGNED_REQUIRED");
  }, 60_000);

  it("still creates its own documents legacy", async () => {
    const created = await b.client.drives.create({ global: { name: "B" } });
    expect(signaturePolicyOf(created.header)).toBe("legacy");
    expect(isDerivedDocumentId(created.header.id)).toBe(false);
  });
});
