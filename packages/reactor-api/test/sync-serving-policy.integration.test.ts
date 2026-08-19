import {
  DocumentModelRegistry,
  DriveCollectionId,
  EventBus,
  GqlRequestChannelFactory,
  GqlResponseChannelFactory,
  InMemoryQueue,
  JobStatus,
  ModelReadGate,
  NullDocumentModelResolver,
  ReactorBuilder,
  readDecisionModel,
  SyncBuilder,
  SyncScopeGate,
  type IChannel,
  type IChannelFactory,
  type IEventBus,
  type InProcessReactorModule,
  type IReactor,
  type ISyncManager,
} from "@powerhousedao/reactor";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import type {
  DocumentModelModule,
  Grant,
} from "@powerhousedao/shared/document-model";
import { initializeAuth } from "@powerhousedao/shared/document-model";
import { ConsoleLogger } from "document-model";
import { afterEach, describe, expect, it } from "vitest";
import type { BridgeTarget } from "./utils/gql-resolver-bridge.js";
import { createResolverBridge } from "./utils/gql-resolver-bridge.js";

const PEER = "0xpeer";

const AUTH_FLAGS = {
  documentDecisions: true,
  authEnforcement: true,
};

/** The peer reads the drive's global scope, and holds no other grant. */
const peerReadsGlobal: Grant = {
  id: "g-peer-read",
  description: "the peer replica reads the drive",
  effect: "allow",
  principal: { address: PEER },
  capability: { can: "read", scope: "global" },
};

/**
 * A policy with no creator has to leave somebody able to administer it, so this
 * grant is what makes the initial policy a legal one. It confers execute on the
 * auth scope alone, which every holder may read anyway.
 */
const anyoneAdministersAuth: Grant = {
  id: "g-auth-admin",
  description: "administration stays reachable",
  effect: "allow",
  principal: { anyone: true },
  capability: { can: "execute", scope: "auth" },
};

type Fixture = {
  origin: InProcessReactorModule;
  peer: PeerSide;
  bridge: typeof fetch;
};

type PeerSide = {
  module: InProcessReactorModule;
  eventBus: IEventBus;
  syncManager: ISyncManager;
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

/**
 * One origin that serves through a policy gate, and one peer that pulls from it
 * over the resolver bridge. The gate is the serving gate the switchboard builds:
 * the registered model, the origin's own read side, and the host's
 * closes-by-default setting.
 */
async function setup(withholdUninitialized: boolean): Promise<Fixture> {
  const logger = new ConsoleLogger(["serving-test"]);
  const registry = new Map<string, ISyncManager | BridgeTarget>();
  const bridge = createResolverBridge(registry, {
    log: false,
    passthroughFetch: () => {
      throw new Error("unexpected passthrough fetch");
    },
  });

  const models = new DocumentModelRegistry();
  models.registerModules(
    driveDocumentModelModule as unknown as DocumentModelModule,
  );

  const originBus = new EventBus();
  const originQueue = new InMemoryQueue(
    originBus,
    new NullDocumentModelResolver(models),
  );
  const origin = await new ReactorBuilder()
    .withEventBus(originBus)
    .withQueue(originQueue)
    .withDocumentModelSources([
      driveDocumentModelModule as unknown as DocumentModelModule,
    ])
    .withExecutorConfig({ featureFlags: AUTH_FLAGS })
    .withSync(
      new SyncBuilder().withChannelFactory(
        compositeFactory(logger, originQueue),
      ),
    )
    .buildModule();

  const peerBus = new EventBus();
  const peerQueue = new InMemoryQueue(
    peerBus,
    new NullDocumentModelResolver(models),
  );
  const peerModule = await new ReactorBuilder()
    .withEventBus(peerBus)
    .withQueue(peerQueue)
    .withDocumentModelSources([
      driveDocumentModelModule as unknown as DocumentModelModule,
    ])
    .withExecutorConfig({ featureFlags: AUTH_FLAGS })
    .withSync(
      new SyncBuilder().withChannelFactory(compositeFactory(logger, peerQueue)),
    )
    .buildModule();

  const model = readDecisionModel(
    origin.featureFlags,
    origin.documentModelRegistry,
  );
  if (!model) {
    throw new Error("expected a decision model");
  }

  registry.set("origin", {
    syncManager: origin.syncModule!.syncManager,
    servingGate: new SyncScopeGate(
      new ModelReadGate(
        model,
        origin.documentView,
        origin.featureFlags.authGroups,
        origin.operationIndex,
        logger,
        { withholdUninitialized },
      ),
      origin.documentView,
      logger,
    ),
    subject: { address: PEER },
  });

  const peer: PeerSide = {
    module: peerModule,
    eventBus: peerBus,
    syncManager: peerModule.syncModule!.syncManager,
  };
  registry.set("peer", peer.syncManager);

  return { origin, peer, bridge };
}

async function pullFrom(
  peer: PeerSide,
  driveId: string,
  bridge: typeof fetch,
): Promise<void> {
  await peer.syncManager.add(
    `origin-${driveId}`,
    DriveCollectionId.forDrive(driveId),
    {
      type: "gql",
      parameters: {
        url: "http://origin/graphql",
        pollIntervalMs: 50,
        retryBaseDelayMs: 25,
        fetchFn: bridge,
      },
    },
    { documentId: [], scope: [], branch: "main" },
  );
}

async function awaitJob(reactor: IReactor, jobId: string): Promise<void> {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const status = await reactor.getJobStatus(jobId);
    if (status.status === JobStatus.FAILED) {
      throw new Error(`job ${jobId} failed: ${status.error?.message}`);
    }
    if (status.status === JobStatus.READ_READY) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`timed out waiting for job ${jobId}`);
}

/** Which scopes of a document the peer holds operations for. */
async function scopesHeld(
  reactor: IReactor,
  documentId: string,
): Promise<string[]> {
  let operations;
  try {
    operations = await reactor.getOperations(documentId, { branch: "main" });
  } catch {
    return [];
  }
  return Object.entries(operations)
    .filter(([, page]) => page.results.length > 0)
    .map(([scope]) => scope)
    .sort();
}

/** Whether the peer holds any operation of one scope. */
async function holds(
  reactor: IReactor,
  documentId: string,
  scope: string,
): Promise<boolean> {
  return (await scopesHeld(reactor, documentId)).includes(scope);
}

/** Long enough for several poll intervals, so an absence means withheld. */
function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 1000));
}

async function waitFor(
  predicate: () => Promise<boolean>,
  message: string,
  timeoutMs = 15000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`timed out waiting for ${message}`);
}

describe("serving sync through the document's policy", () => {
  let running: IReactor[] = [];

  afterEach(() => {
    for (const reactor of running) {
      reactor.kill();
    }
    running = [];
  });

  async function fixture(withholdUninitialized = false): Promise<Fixture> {
    const built = await setup(withholdUninitialized);
    running = [built.origin.reactor, built.peer.module.reactor];
    return built;
  }

  /**
   * A drive the peer is already pulling, created and then named.
   *
   * The peer subscribes before the drive exists because that is the case this
   * stage is about: a replica that is following a collection and is served, or
   * not served, each run as it is written. Naming it puts an operation in the
   * global scope of its own, since a drive's initial state travels in its
   * document scope and a drive that is only created has nothing in global to
   * withhold.
   */
  async function drivePulledFromTheStart(
    fx: Fixture,
    name: string,
  ): Promise<string> {
    const drive = driveDocumentModelModule.utils.createDocument({
      global: { name, icon: null, nodes: [] },
    });
    const driveId = drive.header.id;

    await pullFrom(fx.peer, driveId, fx.bridge);
    await awaitJob(
      fx.origin.reactor,
      (await fx.origin.reactor.create(drive)).id,
    );
    await awaitJob(
      fx.origin.reactor,
      (
        await fx.origin.reactor.execute(driveId, "main", [
          driveDocumentModelModule.actions.setDriveName({
            name: `${name} (named)`,
          }),
        ])
      ).id,
    );

    return driveId;
  }

  async function policyAllowingThePeer(
    fx: Fixture,
    driveId: string,
  ): Promise<void> {
    await awaitJob(
      fx.origin.reactor,
      (
        await fx.origin.reactor.execute(driveId, "main", [
          initializeAuth({
            version: 1,
            grants: [peerReadsGlobal, anyoneAdministersAuth],
          }),
        ])
      ).id,
    );
  }

  async function converged(fx: Fixture, driveId: string): Promise<boolean> {
    const origin = await fx.origin.reactor.get(driveId, { branch: "main" });
    const peer = await fx.peer.module.reactor.get(driveId, { branch: "main" });
    return (
      peer.header.revision.global === origin.header.revision.global &&
      JSON.stringify(peer.state.global) === JSON.stringify(origin.state.global)
    );
  }

  it("serves a policied document to the audience its grants name", async () => {
    const fx = await fixture();
    const driveId = await drivePulledFromTheStart(fx, "Granted");

    await waitFor(
      () => holds(fx.peer.module.reactor, driveId, "global"),
      "the granted scope to converge",
    );
    await policyAllowingThePeer(fx, driveId);

    await waitFor(
      () => holds(fx.peer.module.reactor, driveId, "auth"),
      "the policy to reach the peer",
    );
    expect(await converged(fx, driveId)).toBe(true);
  }, 40000);

  it("serves an unpoliced document in full when the host opens by default", async () => {
    const fx = await fixture(false);
    const driveId = await drivePulledFromTheStart(fx, "Open host");

    await waitFor(
      () => converged(fx, driveId),
      "the unpoliced document to converge",
    );
  }, 40000);

  /**
   * Closes-by-default is the case that withholds without any policy having been
   * written, so it is the one that shows the metadata scopes are never
   * withheld: the peer holds the document scope and nothing of global.
   */
  it("serves only the metadata of an unpoliced document when the host closes by default", async () => {
    const fx = await fixture(true);
    const driveId = await drivePulledFromTheStart(fx, "Closed host");

    await waitFor(
      () => holds(fx.peer.module.reactor, driveId, "document"),
      "the metadata to reach the peer",
    );
    await settle();

    expect(await scopesHeld(fx.peer.module.reactor, driveId)).toEqual([
      "document",
    ]);
    expect(
      fx.peer.syncManager.getByName(`origin-${driveId}`).channel.deadLetter
        .items,
    ).toHaveLength(0);
  }, 40000);

  /**
   * The stage's exit criterion. Nothing re-emits the withheld run: the origin
   * writes nothing new, and an entry the poll consumed would have had its
   * delivery counters advanced past it. The peer can therefore only reach the
   * origin's revision if the run was still queued when the policy named it.
   */
  it("backfills the run it withheld once a policy names the peer", async () => {
    const fx = await fixture(true);
    const driveId = await drivePulledFromTheStart(fx, "Widening");

    await waitFor(
      () => holds(fx.peer.module.reactor, driveId, "document"),
      "the metadata to reach the peer",
    );
    await settle();
    expect(await holds(fx.peer.module.reactor, driveId, "global")).toBe(false);

    await policyAllowingThePeer(fx, driveId);

    await waitFor(
      () => converged(fx, driveId),
      "the peer to reach the origin's state and revision",
    );
    expect(
      fx.peer.syncManager.getByName(`origin-${driveId}`).channel.deadLetter
        .items,
    ).toHaveLength(0);
  }, 40000);
});
