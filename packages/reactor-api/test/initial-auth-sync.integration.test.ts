import {
  defineInitialAuthProvider,
  DriveCollectionId,
  GqlResponseChannelFactory,
  ReactorBuilder,
  ReactorClientBuilder,
  SyncBuilder,
  type InProcessReactorClientModule,
} from "@powerhousedao/reactor";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import {
  authAddress,
  toTransportAction,
  type Operation,
} from "@powerhousedao/shared/document-model";
import {
  ConsoleLogger,
  documentModelDocumentModelModule,
} from "document-model";
import { afterAll, describe, expect, it } from "vitest";
import { referenceNote } from "../../reactor/test/initial-auth/reference-app.js";
import { openAuthorization } from "./utils/read-gate-fixture.js";
import {
  startReactorHttpServer,
  type ReactorHttpServer,
} from "./utils/reactor-http-server.js";
import { createTestSigner } from "./utils/test-signer.js";

describe("protected creation over the HTTP GraphQL sync wire", () => {
  const hosts: InProcessReactorClientModule[] = [];
  let server: ReactorHttpServer | undefined;
  afterAll(async () => {
    await server?.close();
    for (const host of hosts) await host.reactor.kill().completed;
  });
  it("round-trips the routing hint and stages auth-first delivery until the signed envelope is complete", async () => {
    const signer = await createTestSigner("service");
    async function build() {
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
                new GqlResponseChannelFactory(
                  new ConsoleLogger(["initial-auth-wire"]),
                ),
              ),
            ),
        )
        .buildModule();
      hosts.push(host);
      return host;
    }
    const source = await build();
    const receiver = await build();
    const sourceModule = source.reactorModule;
    const receiverModule = receiver.reactorModule;
    if (!sourceModule?.syncModule || !receiverModule?.syncModule)
      throw new Error("Expected local sync modules");
    const created = await source.write.createWithInitialAuth(
      referenceNote.utils.createDocument(),
      {
        requester: { address: "owner" },
        context: "wire",
        idempotencyKey: "wire",
      },
    );
    await created.readable;
    const operations: Operation[] = [];
    for (const scope of ["document", "auth"])
      operations.push(
        ...(
          await sourceModule.operationStore.getSince(
            created.documentId,
            scope,
            "main",
            -1,
          )
        ).results,
      );
    server = await startReactorHttpServer(
      receiver,
      openAuthorization,
      undefined,
      undefined,
      receiverModule.syncModule.syncManager,
    );
    async function request(query: string, variables: Record<string, unknown>) {
      const response = await fetch(server!.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer administrator",
        },
        body: JSON.stringify({ query, variables }),
      });
      const body = (await response.json()) as {
        data?: Record<string, unknown>;
        errors?: unknown[];
      };
      expect(body.errors).toBeUndefined();
      return body.data;
    }
    await request(
      "mutation Touch($input: TouchChannelInput!) { touchChannel(input: $input) { success manifest } }",
      {
        input: {
          id: "protected-wire",
          name: "origin",
          collectionId: DriveCollectionId.forDrive("wire-drive").key,
          filter: { documentId: [], scope: [], branch: "main" },
          sinceTimestampUtcMs: "0",
          manifest: sourceModule.syncModule.syncManager.localManifest(),
        },
      },
    );
    async function push(ops: Operation[]) {
      await request(
        "mutation Push($envelopes: [SyncEnvelopeInput!]!) { pushSyncEnvelopes(envelopes: $envelopes) }",
        {
          envelopes: [
            {
              type: "OPERATIONS",
              channelMeta: { id: "protected-wire" },
              operations: ops.map((operation) => ({
                operation: {
                  ...operation,
                  action: toTransportAction(operation.action),
                },
                context: {
                  documentId: created.documentId,
                  documentType: referenceNote.documentModel.global.id,
                  branch: "main",
                  scope: operation.action.scope,
                  ordinal: operation.index + 1,
                },
              })),
            },
          ],
        },
      );
    }
    await push([operations[2]]);
    await expect
      .poll(
        async () =>
          (
            await receiverModule.database
              .selectFrom("InitialAuthInbox")
              .selectAll()
              .execute()
          ).length,
      )
      .toBe(1);
    await expect(receiver.read.get(created.documentId)).rejects.toThrow();
    await push(operations.slice(0, 2));
    await expect
      .poll(
        async () =>
          (
            await receiverModule.operationStore.getSince(
              created.documentId,
              "auth",
              "main",
              -1,
            )
          ).results.length,
        { timeout: 10000 },
      )
      .toBe(1);
    const replicated = await receiver.read.get(created.documentId, {
      subject: { address: "administrator" },
    });
    expect(replicated.state.auth.version).toBe(1);
    expect(replicated.state.auth.creator).toBeUndefined();
    const result = await request(
      'query Operations($id: String!) { documentOperations(filter: { documentIdOrSlug: $id, scopes: ["auth"] }) { items { action { context { initialAuth } } } } }',
      { id: created.documentId },
    );
    expect(JSON.stringify(result)).toContain(
      operations[2].action.context?.initialAuth,
    );
  });
});
