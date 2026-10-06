// The run user is the latest publish's signer, and a step's scope comes from
// its reactor connection. Real in-process reactor.
import {
  ReactorBuilder,
  ReactorClientBuilder,
  type IReactorClient,
  type InProcessReactorClientModule,
} from "@powerhousedao/reactor";
import {
  withSignaturePolicy,
  type DocumentModelModule,
} from "@powerhousedao/shared/document-model";
import {
  Connection,
  REACTOR_CONNECTOR_ID,
  actions as connectionActions,
} from "@powerhousedao/workflow/document-models/connection";
import {
  Workflow,
  actions as workflowActions,
} from "@powerhousedao/workflow/document-models/workflow";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testSigner } from "../../test/helpers/signer.js";
import { CORE_PIECE_NAME, CORE_PIECE_VERSION } from "../pieces/index.js";
import { buildReactorRunScope } from "./run-scope-builder.js";
import { publishRunUser } from "./run-user.js";

const PUBLISHER = "0xpublisher";
const OTHER = "0xother";
const REACTOR_CONNECTION = "conn-reactor";
const SECRET_CONNECTION = "conn-secret";

let module: InProcessReactorClientModule;
let publisher: IReactorClient;
let other: IReactorClient;
let unsigned: IReactorClient;

function clientOver(signer?: Awaited<ReturnType<typeof testSigner>>) {
  const builder = new ReactorClientBuilder().withReactor(
    module.reactor,
    module.eventBus,
    module.documentIndexer,
    module.documentView,
  );
  return (signer ? builder.withSigner(signer) : builder).build();
}

async function createDocument(
  client: IReactorClient,
  model: DocumentModelModule,
  id: string,
) {
  await client.create(
    withSignaturePolicy(model.utils.createDocument(), "legacy", { id }),
  );
}

async function createWorkflow(
  client: IReactorClient,
  id: string,
  reactorConnectionId: string,
) {
  await createDocument(client, Workflow as never, id);
  await client.execute(id, "main", [
    workflowActions.setTrigger({
      id: "trigger",
      pieceName: CORE_PIECE_NAME,
      pieceVersion: CORE_PIECE_VERSION,
      triggerName: "manual",
      reactorConnectionId,
      config: {},
    }),
    workflowActions.publishWorkflow({
      publishedAt: "2026-10-02T10:00:00.000Z",
    }),
    workflowActions.setWorkflowStatus({ status: "ENABLED" }),
  ]);
}

beforeAll(async () => {
  module = await new ReactorClientBuilder()
    .withReactorBuilder(
      new ReactorBuilder().withDocumentModelSources([
        Workflow as unknown as DocumentModelModule,
        Connection as unknown as DocumentModelModule,
      ]),
    )
    .buildModule();
  publisher = await clientOver(await testSigner(PUBLISHER));
  other = await clientOver(await testSigner(OTHER));
  unsigned = await clientOver();

  await createDocument(publisher, Connection as never, REACTOR_CONNECTION);
  await publisher.execute(REACTOR_CONNECTION, "main", [
    connectionActions.setConnector({
      connectorId: REACTOR_CONNECTOR_ID,
      authType: "REACTOR",
    }),
    connectionActions.setConfig({
      config: { endpoint: "local", access: "read" },
    }),
  ]);
  await createDocument(publisher, Connection as never, SECRET_CONNECTION);
  await publisher.execute(SECRET_CONNECTION, "main", [
    connectionActions.setConnector({
      connectorId: "@acme/piece-x#x",
      authType: "SECRET_TEXT",
    }),
  ]);

  await createWorkflow(publisher, "wf-signed", REACTOR_CONNECTION);
  await createWorkflow(unsigned, "wf-unsigned", REACTOR_CONNECTION);
  // Published by the publisher, then republished by someone else.
  await createWorkflow(publisher, "wf-republished", REACTOR_CONNECTION);
  await other.execute("wf-republished", "main", [
    workflowActions.publishWorkflow({
      publishedAt: "2026-10-02T11:00:00.000Z",
    }),
  ]);
});

afterAll(() => {
  module.reactor.kill();
});

describe("the run user", () => {
  it("is the latest publish's signer", async () => {
    const runUser = await publishRunUser(publisher, "wf-republished");
    expect(runUser?.address).toBe(OTHER);
  });

  it("is null for an unsigned publish", async () => {
    await expect(publishRunUser(publisher, "wf-unsigned")).resolves.toBeNull();
  });
});

describe("building a run scope", () => {
  const host = () => ({ reactorClient: publisher, authEnforcement: false });
  const runUser = { address: PUBLISHER, subject: { address: PUBLISHER } };

  it("takes access from the bound connection", async () => {
    await expect(
      buildReactorRunScope(host(), {
        reactorConnectionId: REACTOR_CONNECTION,
        requireReactor: "write",
        runUser,
      }),
    ).resolves.toEqual({
      runUser,
      requireReactor: "write",
      connection: { access: "read" },
    });
  });

  it("refuses a step with no reactor connection, or another kind", async () => {
    await expect(
      buildReactorRunScope(host(), {
        reactorConnectionId: null,
        requireReactor: "read",
        runUser,
      }),
    ).rejects.toThrow(/bind a reactor connection/);
    await expect(
      buildReactorRunScope(host(), {
        reactorConnectionId: SECRET_CONNECTION,
        requireReactor: "read",
        runUser,
      }),
    ).rejects.toThrow(/is not a reactor connection/);
  });
});
