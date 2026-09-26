import {
  DriveCollectionId,
  GqlResponseChannelFactory,
  JobStatus,
  ReactorBuilder,
  SyncBuilder,
  type InProcessReactorModule,
  type ISyncManager,
} from "@powerhousedao/reactor";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import {
  localPeerManifest,
  mergePeerCapabilities,
  PEER_CAPABILITIES,
  withSignaturePolicy,
  type DocumentModelModule,
  type PeerCapability,
} from "@powerhousedao/shared/document-model";
import { ConsoleLogger } from "document-model";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReactorSubgraph } from "../src/graphql/reactor/subgraph.js";
import type { SubgraphArgs } from "../src/graphql/types.js";
import type { IAuthorizationService } from "../src/services/authorization.service.js";

const testProtocol = (versions: number[]): PeerCapability => ({
  kind: "protocol",
  name: "test-protocol",
  baseline: [1],
  supported: () => versions,
  preferred: () => Math.max(...versions),
  optional: true,
});

const narrow = localPeerManifest(
  mergePeerCapabilities(PEER_CAPABILITIES, [testProtocol([1])]),
  {},
);
const COLLECTION = DriveCollectionId.forDrive("held-drive");
const FILTER = { documentId: [], scope: [], branch: "main" };
const ADMIN = "0xadmin";
const OWNER = "0xowner";

describe("the syncHolds and peerAgreement queries", () => {
  let module: InProcessReactorModule;
  let syncManager: ISyncManager;
  let subgraph: ReactorSubgraph;

  beforeEach(async () => {
    module = await new ReactorBuilder()
      .withDocumentModelSources([
        driveDocumentModelModule as unknown as DocumentModelModule,
      ])
      .withPeerCapabilities([testProtocol([1, 2])])
      .withSync(
        new SyncBuilder().withChannelFactory(
          new GqlResponseChannelFactory(new ConsoleLogger(["test"])),
        ),
      )
      .buildModule();
    syncManager = module.syncModule!.syncManager;
    await syncManager.add(
      "client",
      COLLECTION,
      { type: "polling", parameters: {} },
      FILTER,
      { boundAddress: OWNER },
      "client-1",
      narrow,
    );

    const info = await module.reactor.create(
      withSignaturePolicy(
        driveDocumentModelModule.utils.createDocument(),
        "legacy",
        {
          id: "held-drive",
          protocolVersions: { "test-protocol": 2 },
        },
      ),
    );
    await vi.waitUntil(
      async () =>
        (await module.reactor.getJobStatus(info.id)).status ===
        JobStatus.READ_READY,
    );
    await vi.waitUntil(async () => (await syncManager.listHolds()).length > 0);

    subgraph = new ReactorSubgraph({
      reactorClient: {},
      authorizationService: {
        isSupremeAdmin: (address?: string) => address === ADMIN,
      } as Partial<IAuthorizationService>,
      relationalDb: {},
      analyticsStore: {},
      graphqlManager: {},
      syncManager,
    } as unknown as SubgraphArgs);
  });

  afterEach(() => {
    module.reactor.kill();
  });

  const query = (name: "syncHolds" | "peerAgreement") =>
    (
      subgraph.resolvers.Query as Record<
        string,
        (...args: unknown[]) => unknown
      >
    )[name];
  const as = (address?: string) => ({
    user: address ? { address } : undefined,
    headers: {},
  });

  it("lists holds to an admin and to the address the remote is bound to", async () => {
    const expected = [
      {
        remoteName: "client",
        documentId: "held-drive",
        branch: "main",
        reason: { protocol: "test-protocol", version: 2, peerSupports: [1] },
        heldAtUtcMs: expect.any(String),
      },
    ];
    await expect(query("syncHolds")(null, {}, as(ADMIN))).resolves.toEqual(
      expected,
    );
    await expect(
      query("syncHolds")(null, { remoteName: "client" }, as(OWNER)),
    ).resolves.toEqual(expected);
  });

  it("refuses holds to anyone else", async () => {
    await expect(
      query("syncHolds")(null, { remoteName: "client" }, as("0xstranger")),
    ).rejects.toThrow("Forbidden");
    await expect(query("syncHolds")(null, {}, as(OWNER))).rejects.toThrow(
      "Forbidden",
    );
    await expect(
      query("syncHolds")(null, { remoteName: "client" }, as()),
    ).rejects.toThrow("Forbidden");
  });

  it("reports agreement for a collection, and refuses a caller with no channel in it", async () => {
    const agreement = (await query("peerAgreement")(
      null,
      { collectionId: COLLECTION.key },
      as(OWNER),
    )) as {
      local: { revision: string };
      members: Array<{ remoteName: string; announced: boolean }>;
      limitedBy: Array<{ protocol: string; remoteNames: string[] }>;
    };

    expect(agreement.local.revision).toBe(syncManager.localManifest().revision);
    expect(agreement.members).toEqual([
      expect.objectContaining({ remoteName: "client", announced: true }),
    ]);
    expect(agreement.limitedBy).toContainEqual({
      protocol: "test-protocol",
      remoteNames: ["client"],
    });

    expect(() =>
      query("peerAgreement")(
        null,
        { collectionId: COLLECTION.key },
        as("0xstranger"),
      ),
    ).toThrow("Forbidden");
  });
});
