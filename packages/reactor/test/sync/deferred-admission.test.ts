import {
  driveDocumentModelModule,
  type DocumentDriveDocument,
} from "@powerhousedao/shared/document-drive";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DriveCollectionId } from "../../src/cache/operation-index-types.js";
import type { ReactorClient } from "../../src/client/reactor-client.js";
import { ReactorBuilder } from "../../src/core/reactor-builder.js";
import { ReactorClientBuilder } from "../../src/core/reactor-client-builder.js";
import type { IReactor, ReactorModule } from "../../src/core/types.js";
import type { SignatureTrustPolicy } from "../../src/signer/types.js";
import type { ISyncCursorStorage } from "../../src/storage/interfaces.js";
import type { IChannelFactory } from "../../src/sync/interfaces.js";
import { SyncBuilder } from "../../src/sync/sync-builder.js";
import type { ChannelConfig, SyncEnvelope } from "../../src/sync/types.js";
import { TestP256Signer } from "../utils/p256-signer.js";
import { TestChannel } from "./channels/test-channel.js";

/**
 * A peer's writes reach a replica before the replica's trust policy can find
 * the peer's credential. The loads wait and are admitted; nothing is
 * dead-lettered.
 */
type Peer = {
  client: ReactorClient;
  reactor: IReactor;
  module: ReactorModule;
};

describe("a replica whose trust policy has not found a peer's credential yet", () => {
  let peerMapping: Map<string, string>;
  let a: Peer;
  let b: Peer;
  let asked: string[];
  let misses: number;

  beforeEach(async () => {
    const channels = new Map<string, TestChannel>();
    peerMapping = new Map();
    asked = [];
    misses = 4;
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
    const build = async (trustPolicy?: SignatureTrustPolicy): Promise<Peer> => {
      const reactorBuilder = new ReactorBuilder()
        .withDocumentModelSources([driveDocumentModelModule as never])
        .withSync(new SyncBuilder().withChannelFactory(channelFactory()));
      if (trustPolicy) {
        reactorBuilder.withTrustPolicy(trustPolicy);
      }
      const built = await new ReactorClientBuilder()
        .withReactorBuilder(reactorBuilder)
        .withSigner((await TestP256Signer.create()).asISigner())
        .buildModule();
      return {
        client: built.client,
        reactor: built.reactor,
        module: built.reactorModule!,
      };
    };
    a = await build();
    b = await build({
      authorizeSigner(_signer, key) {
        asked.push(key);
        if (misses-- > 0) {
          return Promise.reject(
            Object.assign(new Error("no credential yet"), {
              name: "MissingCredentialError",
              retryAfterMs: 20,
            }),
          );
        }
        return Promise.resolve(true);
      },
    });
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

  it("admits the loads once the credential is found, dead-lettering nothing", async () => {
    const drive = driveDocumentModelModule.utils.createDocument();
    const id = drive.header.id;
    await connect(id);

    await a.client.create(drive);
    await a.client.execute(id, "main", [
      driveDocumentModelModule.actions.setDriveName({ name: "From A" }),
    ]);

    const seen = await eventually(async () => {
      const document = await b.client.get<DocumentDriveDocument>(id);
      if (document.state.global.name !== "From A") {
        throw new Error(`B sees ${document.state.global.name}`);
      }
      return document;
    });

    expect(seen.state.global.name).toBe("From A");
    expect(asked.length).toBeGreaterThan(4);
    const remote = b.module.syncModule!.syncManager.getByName(`toA-${id}`);
    expect(remote.channel.deadLetter.items).toEqual([]);
  }, 60_000);
});
