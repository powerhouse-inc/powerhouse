import {
  DocumentModelRegistry,
  DriveCollectionId,
  EventBus,
  GqlRequestChannelFactory,
  GqlResponseChannelFactory,
  InMemoryQueue,
  NullDocumentModelResolver,
  ReactorBuilder,
  ReactorClientBuilder,
  SyncBuilder,
  type IChannel,
  type IChannelFactory,
  type InProcessReactorClientModule,
  type InProcessReactorModule,
  type ISyncManager,
  type SyncOperation,
} from "@powerhousedao/reactor";
import type { DocumentDriveDocument } from "@powerhousedao/shared/document-drive";
import {
  driveDocumentModelModule,
  setDriveName,
} from "@powerhousedao/shared/document-drive";
import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import {
  ConsoleLogger,
  documentModelDocumentModelModule,
} from "document-model";
import { afterEach, describe, expect, it } from "vitest";
import {
  createEmptyDocument,
  deleteDocument,
} from "../src/graphql/reactor/resolvers.js";
import { AuthorizationPolicy } from "../src/services/authorization.service.js";
import { buildSyncServingGate } from "../src/services/sync-serving-gate.js";
import type { BridgeTarget } from "./utils/gql-resolver-bridge.js";
import { createResolverBridge } from "./utils/gql-resolver-bridge.js";
import { createTestSigner, trustOnly } from "./utils/test-signer.js";

const MODULES = [
  driveDocumentModelModule as unknown as DocumentModelModule,
  documentModelDocumentModelModule as unknown as DocumentModelModule,
];

type Fixture = {
  origin: InProcessReactorClientModule;
  originModule: InProcessReactorModule;
  peer: InProcessReactorModule;
  peerSyncManager: ISyncManager;
  bridge: typeof fetch;
  pollErrors: Error[];
};

function compositeFactory(
  logger: ConsoleLogger,
  queue: InMemoryQueue,
): IChannelFactory {
  const request = new GqlRequestChannelFactory(logger, undefined, queue);
  const response = new GqlResponseChannelFactory(logger);
  return {
    instance(...args): IChannel {
      const [remoteId, remoteName, config, cursorStorage] = args;
      if (config.type === "polling") {
        return response.instance(remoteId, remoteName, config, cursorStorage);
      }
      return request.instance(...args);
    },
  };
}

// A throwing resolver reaches the client as a GraphQL error, as in the subgraph.
function asGraphQLServer(
  bridge: typeof fetch,
  pollErrors: Error[],
): typeof fetch {
  return async (input, init) => {
    try {
      return await bridge(input, init);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      pollErrors.push(err);
      return new Response(
        JSON.stringify({ errors: [{ message: err.message }] }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  };
}

/** Default flags: documentDecisions off, so deleted documents read as missing. */
async function setup(): Promise<Fixture> {
  const logger = new ConsoleLogger(["deleted-child-sync"]);
  const registry = new Map<string, ISyncManager | BridgeTarget>();
  const pollErrors: Error[] = [];
  const bridge = asGraphQLServer(
    createResolverBridge(registry, {
      log: false,
      passthroughFetch: () => {
        throw new Error("unexpected passthrough fetch");
      },
    }),
    pollErrors,
  );

  const signer = await createTestSigner();
  const models = new DocumentModelRegistry();
  models.registerModules(...MODULES);

  const originBus = new EventBus();
  const originQueue = new InMemoryQueue(
    originBus,
    new NullDocumentModelResolver(models),
  );
  const origin = await new ReactorClientBuilder()
    .withReactorBuilder(
      new ReactorBuilder()
        .withEventBus(originBus)
        .withQueue(originQueue)
        .withDocumentModelSources(MODULES)
        .withSync(
          new SyncBuilder().withChannelFactory(
            compositeFactory(logger, originQueue),
          ),
        ),
    )
    .withSigner(signer)
    .buildModule();
  const originModule = origin.reactorModule!;

  const peerBus = new EventBus();
  const peerQueue = new InMemoryQueue(
    peerBus,
    new NullDocumentModelResolver(models),
  );
  const peer = await new ReactorBuilder()
    .withTrustPolicy(trustOnly(signer))
    .withEventBus(peerBus)
    .withQueue(peerQueue)
    .withDocumentModelSources(MODULES)
    .withSync(
      new SyncBuilder().withChannelFactory(compositeFactory(logger, peerQueue)),
    )
    .buildModule();

  // The serving gate the switchboard builds (buildSyncServingGate).
  const servingGate = buildSyncServingGate(
    originModule,
    {
      admins: [],
      defaultProtection: false,
      policy: AuthorizationPolicy.OPEN,
    },
    logger,
  );
  expect(servingGate).toBeDefined();

  registry.set("origin", {
    syncManager: originModule.syncModule!.syncManager,
    servingGate,
    subject: {},
  });
  registry.set("peer", peer.syncModule!.syncManager);

  return {
    origin,
    originModule,
    peer,
    peerSyncManager: peer.syncModule!.syncManager,
    bridge,
    pollErrors,
  };
}

async function pullFrom(fx: Fixture, driveId: string): Promise<void> {
  await fx.peerSyncManager.add(
    `origin-${driveId}`,
    DriveCollectionId.forDrive(driveId),
    {
      type: "gql",
      parameters: {
        url: "http://origin/graphql",
        pollIntervalMs: 50,
        retryBaseDelayMs: 25,
        fetchFn: fx.bridge,
      },
    },
    { documentId: [], scope: [], branch: "main" },
  );
}

async function waitFor(
  predicate: () => Promise<boolean>,
  message: string,
  timeoutMs = 10000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`timed out waiting for ${message}`);
}

function settle(ms = 1000): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function peerHas(fx: Fixture, documentId: string): Promise<boolean> {
  try {
    await fx.peer.reactor.get(documentId, { branch: "main" });
    return true;
  } catch {
    return false;
  }
}

async function peerDrive(
  fx: Fixture,
  driveId: string,
): Promise<DocumentDriveDocument | undefined> {
  try {
    return await fx.peer.reactor.get<DocumentDriveDocument>(driveId, {
      branch: "main",
    });
  } catch {
    return undefined;
  }
}

function channelState(fx: Fixture, driveId: string): string {
  return fx.peerSyncManager
    .getByName(`origin-${driveId}`)
    .channel.getConnectionState().state;
}

/** Each serving failure with the frames that raised it. */
function servedErrors(fx: Fixture): string[] {
  return fx.pollErrors.map(
    (e) => e.stack?.split("\n").slice(0, 5).join("\n") ?? e.message,
  );
}

function undeliveredAtOrigin(fx: Fixture): SyncOperation[] {
  return fx.originModule
    .syncModule!.syncManager.list()
    .flatMap((remote) => [...remote.channel.outbox.items])
    .filter((entry) => !entry.deliveredCount);
}

describe("syncing a drive after one of its documents is deleted", () => {
  let running: Array<{ kill(): unknown }> = [];

  afterEach(() => {
    for (const reactor of running) {
      reactor.kill();
    }
    running = [];
  });

  async function childUnderDrive(
    fx: Fixture,
    driveId: string,
  ): Promise<string> {
    // What the createEmptyDocument(parentIdentifier) mutation does.
    const child = await createEmptyDocument(fx.origin.client, {
      documentType: documentModelDocumentModelModule.documentModel.global.id,
      parentIdOrSlug: driveId,
      name: "child",
    });
    return child.id;
  }

  async function peerNodeIds(fx: Fixture, driveId: string): Promise<string[]> {
    const drive = await peerDrive(fx, driveId);
    return drive?.state.global.nodes.map((n) => n.id) ?? [];
  }

  async function renameReachesPeer(fx: Fixture, driveId: string) {
    await fx.origin.client.execute(driveId, "main", [
      setDriveName({ name: "Drive (renamed)" }),
    ]);
    await waitFor(
      async () =>
        (await peerDrive(fx, driveId))?.state.global.name === "Drive (renamed)",
      "the rename to reach the peer",
    );
  }

  async function started(): Promise<Fixture> {
    const fx = await setup();
    running = [fx.origin.reactor, fx.peer.reactor];
    return fx;
  }

  // The history is served from the collection, and the child's pre-removal
  // operations are still in it, so the gate is asked about a deleted document.
  it("serves a drive to a peer that joins after one of its files was deleted", async () => {
    const fx = await started();
    const drive = await fx.origin.client.drives.create({
      global: { name: "Drive" },
    });
    const driveId = drive.header.id;
    const childId = await childUnderDrive(fx, driveId);
    // What the deleteDocument mutation does: removeNode through the drive client.
    await deleteDocument(fx.origin.client, { idOrSlug: childId });

    await pullFrom(fx, driveId);
    await settle();

    // (a), soft so (b) and (c) still report.
    expect.soft(servedErrors(fx)).toEqual([]);
    expect.soft(channelState(fx, driveId)).not.toBe("error");
    // (b)
    await renameReachesPeer(fx, driveId);
    expect(await peerNodeIds(fx, driveId)).not.toContain(childId);
    // (c)
    expect(
      await peerHas(fx, childId),
      "peer still holds the deleted child",
    ).toBe(false);
  }, 40000);

  // DEFECT PIN: with documentDecisions off the view reads a deleted document as
  // missing, so the gate serves it metadata only and its global run stays
  // queued. Expect [] once the flag is removed and decisions are always on.
  it("serves a late peer a drive whose deleted file had domain operations", async () => {
    const fx = await started();
    const drive = await fx.origin.client.drives.create({
      global: { name: "Drive" },
    });
    const driveId = drive.header.id;
    const childId = await childUnderDrive(fx, driveId);
    await fx.origin.client.execute(childId, "main", [
      documentModelDocumentModelModule.actions.setModelName({ name: "named" }),
    ]);
    await deleteDocument(fx.origin.client, { idOrSlug: childId });

    await pullFrom(fx, driveId);
    await renameReachesPeer(fx, driveId);

    expect(servedErrors(fx)).toEqual([]);
    await settle();
    const left = undeliveredAtOrigin(fx).map((entry) => ({
      document: entry.documentId === childId ? "child" : entry.documentId,
      scopes: entry.scopes,
      types: entry.operations.map((op) => op.operation.action.type),
    }));
    expect(left).toEqual([
      { document: "child", scopes: ["global"], types: ["SET_MODEL_NAME"] },
    ]);
  }, 40000);

  // Failed only when the child's entries were still queued at delete.
  it("keeps serving a followed drive after one of its files is deleted", async () => {
    const fx = await started();
    const drive = await fx.origin.client.drives.create({
      global: { name: "Drive" },
    });
    const driveId = drive.header.id;
    await pullFrom(fx, driveId);
    await waitFor(() => peerHas(fx, driveId), "the drive to reach the peer");

    const childId = await childUnderDrive(fx, driveId);
    await waitFor(() => peerHas(fx, childId), "the child to reach the peer");
    await deleteDocument(fx.origin.client, { idOrSlug: childId });
    await settle();

    // (a)
    expect(servedErrors(fx)).toEqual([]);
    expect(channelState(fx, driveId)).not.toBe("error");
    // (b)
    await renameReachesPeer(fx, driveId);
    expect(await peerNodeIds(fx, driveId)).not.toContain(childId);
    await waitFor(
      () => Promise.resolve(undeliveredAtOrigin(fx).length === 0),
      "the origin to count every entry delivered",
    );
  }, 40000);

  // The child leaves the collection (REMOVE_RELATIONSHIP) before DELETE_DOCUMENT.
  it("tells a following peer that the deleted file's document is gone", async () => {
    const fx = await started();
    const drive = await fx.origin.client.drives.create({
      global: { name: "Drive" },
    });
    const driveId = drive.header.id;
    await pullFrom(fx, driveId);
    const childId = await childUnderDrive(fx, driveId);
    await waitFor(() => peerHas(fx, childId), "the child to reach the peer");

    await deleteDocument(fx.origin.client, { idOrSlug: childId });
    await renameReachesPeer(fx, driveId);

    await waitFor(
      async () => !(await peerHas(fx, childId)),
      "the child to read as deleted on the peer",
      5000,
    );
  }, 40000);
});
