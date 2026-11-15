import {
  defineInitialAuthProvider,
  DriveCollectionId,
  GqlResponseChannelFactory,
  ReactorBuilder,
  ReactorClientBuilder,
  SyncBuilder,
  SyncOperation,
} from "@powerhousedao/reactor";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import { authAddress } from "@powerhousedao/shared/document-model";
import {
  ConsoleLogger,
  documentModelDocumentModelModule,
} from "document-model";
import { expect, it } from "vitest";
import { referenceNote } from "../../reactor/test/initial-auth/reference-app.js";
import { buildSyncServingGate } from "../src/services/sync-serving-gate.js";
import { openAuthorization } from "./utils/read-gate-fixture.js";
import {
  startReactorHttpServer,
  type ReactorHttpServer,
} from "./utils/reactor-http-server.js";
import { createTestSigner } from "./utils/test-signer.js";

it("withholds a protected outbox snapshot before its view exists and serves only authorized peers after recovery", async () => {
  const signer = await createTestSigner("service");
  const logger = new ConsoleLogger(["bootstrap-readiness"]);
  const host = await new ReactorClientBuilder()
    .withSigner(signer)
    .withReactorBuilder(
      new ReactorBuilder()
        .withDocumentModelSources([
          driveDocumentModelModule,
          documentModelDocumentModelModule,
          referenceNote,
        ])
        .withTrustPolicy({ authorizeSigner: () => Promise.resolve(true) })
        .withExecutorConfig({
          signatureVerification: "enforce",
          featureFlags: {
            documentDecisions: true,
            authEnforcement: true,
            authGroups: true,
            authConditions: true,
          },
        })
        .withInitialAuth({
          providers: [
            defineInitialAuthProvider(referenceNote, {
              deployment: { administrator: authAddress("administrator") },
              authorizeCreation() {},
              resolveInstance: () => ({ owner: authAddress("owner") }),
            }),
          ],
          trustOrigin: () => true,
        })
        .withSync(
          new SyncBuilder().withChannelFactory(
            new GqlResponseChannelFactory(logger),
          ),
        ),
    )
    .buildModule();
  let server: ReactorHttpServer | undefined;
  try {
    const module = host.reactorModule;
    if (!module?.syncModule) throw new Error("Expected in-process sync");
    const sync = module.syncModule.syncManager;
    server = await startReactorHttpServer(
      host,
      openAuthorization,
      undefined,
      undefined,
      sync,
      buildSyncServingGate(module, openAuthorization.config, logger),
    );
    const url = server.url;
    async function request(
      query: string,
      variables: Record<string, unknown>,
      address: string,
    ) {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${address}`,
        },
        body: JSON.stringify({ query, variables }),
      });
      const body = await response.json();
      expect(body.errors).toBeUndefined();
      return body.data;
    }
    const manifest = sync.localManifest();
    for (const address of ["outsider", "administrator"]) {
      await request(
        "mutation Touch($input: TouchChannelInput!) { touchChannel(input: $input) { success } }",
        {
          input: {
            id: address,
            name: address,
            collectionId: DriveCollectionId.forDrive("readiness-drive").key,
            filter: { documentId: [], scope: [], branch: "main" },
            sinceTimestampUtcMs: "0",
            manifest,
          },
        },
        address,
      );
    }
    module.readModelCoordinator.stop();
    const created = await host.write.createWithInitialAuth(
      referenceNote.utils.createDocument(),
      {
        requester: { address: "owner" },
        context: "wire",
        idempotencyKey: "before-view",
      },
    );
    await created.written;
    await expect(module.documentView.get(created.documentId)).rejects.toThrow();
    const history = (
      await module.operationStore.getSince(
        created.documentId,
        "document",
        "main",
        -1,
      )
    ).results;
    for (const address of ["outsider", "administrator"]) {
      sync.getById(address).channel.outbox.add(
        new SyncOperation(
          `snapshot-${address}`,
          "creation",
          [],
          address,
          created.documentId,
          ["document"],
          "main",
          history.map((operation) => ({
            operation,
            context: {
              documentId: created.documentId,
              documentType: referenceNote.documentModel.global.id,
              branch: "main",
              scope: "document",
              ordinal: operation.index + 1,
            },
          })),
        ),
      );
    }
    const poll = (address: string) =>
      request(
        'query Poll($channel: String!) { pollSyncEnvelopes(channelId: $channel, outboxAck: 0, outboxLatest: 0, manifestRevision: "current") { envelopes { type operations { operation { action { type input } } } } } }',
        { channel: address },
        address,
      );
    expect(JSON.stringify(await poll("outsider"))).not.toContain(
      "PRIVATE_INITIAL_DRAFT",
    );
    expect(JSON.stringify(await poll("administrator"))).not.toContain(
      "PRIVATE_INITIAL_DRAFT",
    );
    await module.catchUp.sweepNow();
    expect(JSON.stringify(await poll("outsider"))).not.toContain(
      "PRIVATE_INITIAL_DRAFT",
    );
    expect(JSON.stringify(await poll("administrator"))).toContain(
      "PRIVATE_INITIAL_DRAFT",
    );
  } finally {
    await server?.close();
    await host.reactor.kill().completed;
  }
}, 60_000);
