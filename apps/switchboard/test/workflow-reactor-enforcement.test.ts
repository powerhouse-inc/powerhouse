// Under enforcement, with the Switchboard's Renown trust policy and real
// signers: who a publish makes the run user, and what a run may read and write.
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ReactorBuilder,
  ReactorClientBuilder,
  type IReactorClient,
  type InProcessReactorClientModule,
  type SignatureTrustPolicy,
} from "@powerhousedao/reactor";
import {
  AuthorizationPolicy,
  getDbClient,
  type Context,
  type IAuthorizationService,
} from "@powerhousedao/reactor-api";
import {
  CORE_PIECE_NAME,
  CORE_PIECE_VERSION,
  publishRunUser,
} from "@powerhousedao/reactor-workflow";
import {
  initializeAuth,
  withSignaturePolicy,
  type Action,
  type DocumentModelModule,
  type Grant,
  type ISigner,
} from "@powerhousedao/shared/document-model";
import {
  createRelationalDb,
  type IRelationalDb,
} from "@powerhousedao/shared/processors";
import {
  Connection,
  REACTOR_CONNECTOR_ID,
  actions as connectionActions,
} from "@powerhousedao/workflow/document-models/connection";
import {
  Workflow,
  actions as workflowActions,
} from "@powerhousedao/workflow/document-models/workflow";
import {
  buildAndSignCredential,
  MemoryKeyStorage,
  RenownCryptoBuilder,
  RenownCryptoSigner,
  type IRenown,
  type PowerhouseVerifiableCredential,
  type SignCredentialTypedData,
} from "@renown/sdk/node";
import type { ILogger } from "document-model";
import { documentModelDocumentModelModule } from "document-model";
import type { Kysely } from "kysely";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getRenownTrustPolicyConfig } from "../src/renown.js";
import {
  composeWorkflowRuntime,
  hostIdentityOf,
  reactorAccessOf,
  type ComposedWorkflowRuntime,
} from "../src/workflow-runtime.mjs";

// viem is the SDK's own dependency; the switchboard does not declare it.
type Account = {
  address: `0x${string}`;
  signTypedData(args: unknown): Promise<`0x${string}`>;
};
const { privateKeyToAccount } = createRequire(
  import.meta.resolve("@renown/sdk/node"),
)("viem/accounts") as {
  privateKeyToAccount: (key: `0x${string}`) => Account;
};

// Well-known Anvil dev keys; never used for anything real.
const PUBLISHER = privateKeyToAccount(
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
);
const ATTACKER = privateKeyToAccount(
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
);
const HOST = privateKeyToAccount(
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
);

const PIECE = "@powerhousedao/piece-enforcement-ops";
const PIECE_VERSION = "1.0.0";

const SOURCE = `
const text = (name) => ({ displayName: name, type: "SHORT_TEXT", required: false });
const action = (name, run) => ({
  name,
  displayName: name,
  description: name,
  requireAuth: false,
  requireReactor: "write",
  props: { id: text("id") },
  run,
});
const setName = (name) => ({
  id: "set-name-" + Date.now(),
  type: "SET_NAME",
  scope: "global",
  input: { name },
  timestampUtcMs: new Date().toISOString(),
});
module.exports = {
  app: {
    displayName: "Ops",
    description: "Document operations",
    logoUrl: "https://example.com/ops.png",
    categories: [],
    actions: {
      rename: action("rename", async (ctx) =>
        (await ctx.reactor.execute(ctx.propsValue.id, "main", [setName("Renamed")])).header.name),
      read: action("read", async (ctx) =>
        (await ctx.reactor.find({ ids: [ctx.propsValue.id] })).results.length),
      delete: action("delete", async (ctx) => {
        await ctx.reactor.deleteDocument(ctx.propsValue.id);
        return "deleted";
      }),
    },
    triggers: {},
  },
};
`;

const logger = {
  verbose: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: () => logger,
} as unknown as ILogger;

const ctxOf = (address: string) =>
  ({ headers: {}, db: {}, user: { address } }) as unknown as Context;

const grant = (
  id: string,
  principal: Grant["principal"],
  capability: Grant["capability"],
): Grant => ({ id, description: id, effect: "allow", principal, capability });

const user = (address: string) => ({
  address,
  networkId: "eip155",
  chainId: 1,
});

async function signerFor(address: string): Promise<RenownCryptoSigner> {
  const crypto = await new RenownCryptoBuilder()
    .withKeyPairStorage(new MemoryKeyStorage())
    .build();
  return new RenownCryptoSigner(crypto, "connect", user(address));
}

// The renown read model's row for a credential.
function credentialRow(c: PowerhouseVerifiableCredential) {
  return {
    documentId: "doc-cred",
    credentialId: c.id,
    context: c["@context"],
    type: c.type,
    issuerId: c.issuer.id,
    issuerEthereumAddress: c.issuer.ethereumAddress,
    issuanceDate: c.issuanceDate,
    expirationDate: c.expirationDate,
    credentialSubjectId: c.credentialSubject.id,
    credentialSubjectApp: c.credentialSubject.app,
    credentialStatusId: null,
    credentialStatusType: null,
    credentialSchemaId: c.credentialSchema.id,
    credentialSchemaType: c.credentialSchema.type,
    proofVerificationMethod: c.proof.verificationMethod,
    proofEthereumAddress: c.proof.ethereumAddress,
    proofCreated: c.proof.created,
    proofPurpose: c.proof.proofPurpose,
    proofType: c.proof.type,
    proofValue: c.proof.proofValue,
    proofEip712Domain: JSON.stringify(c.proof.eip712.domain),
    proofEip712PrimaryType: c.proof.eip712.primaryType,
    revoked: false,
  };
}

// The account delegates the signer's key, as Renown login does.
function credentialFor(account: Account, key: string) {
  return buildAndSignCredential({
    signTypedData: ((args) =>
      account.signTypedData(args)) as SignCredentialTypedData,
    address: account.address,
    chainId: 1,
    app: "connect",
    appId: key,
  });
}

const OPEN: IAuthorizationService = {
  config: {
    admins: [],
    defaultProtection: false,
    policy: AuthorizationPolicy.OPEN,
  },
  // The reactor gate, not IAuthorizationService, is under test.
  isSupremeAdmin: () => true,
  canCreate: () => true,
  canRead: () => Promise.resolve(true),
  canWrite: () => Promise.resolve(true),
  canManage: () => Promise.resolve(true),
  canMutate: () => Promise.resolve(true),
};

type Resolver = (parent: unknown, args: unknown, ctx: Context) => unknown;
type StepResult = {
  runId: string;
  status: string;
  output: unknown;
  error?: string | null;
  errorName?: string | null;
};

let root = "";
let module: InProcessReactorClientModule;
let hostSigner: RenownCryptoSigner;
let publisherSigner: RenownCryptoSigner;
let attackerSigner: RenownCryptoSigner;
let publisher: IReactorClient;
let composed: ComposedWorkflowRuntime;
let queries: Record<string, Resolver>;
let mutations: Record<string, Resolver>;
let trustPolicy: SignatureTrustPolicy;
let pieceBundle = "";

function clientOver(
  signer?: ISigner,
  over: InProcessReactorClientModule = module,
): Promise<IReactorClient> {
  const builder = new ReactorClientBuilder().withReactor(
    over.reactor,
    over.eventBus,
    over.documentIndexer,
    over.documentView,
  );
  return (signer ? builder.withSigner(signer) : builder).build();
}

async function createDocument(
  model: DocumentModelModule,
  id: string,
  grants: Grant[],
  client: IReactorClient = publisher,
) {
  await client.create(
    withSignaturePolicy(model.utils.createDocument(), "legacy", { id }),
  );
  await client.execute(id, "main", [initializeAuth({ version: 1, grants })]);
}

type Harness = {
  module: InProcessReactorClientModule;
  publisher: IReactorClient;
  composed: ComposedWorkflowRuntime;
  queries: Record<string, Resolver>;
  mutations: Record<string, Resolver>;
};

// A reactor signing as HOST under the Renown trust policy, with the runtime.
async function harness(authEnforcement: boolean): Promise<Harness> {
  const built = await new ReactorClientBuilder()
    .withSigner(hostSigner)
    .withCreateSignaturePolicy("legacy")
    .withReactorBuilder(
      new ReactorBuilder()
        .withDocumentModelSources([
          Workflow as unknown as DocumentModelModule,
          Connection as unknown as DocumentModelModule,
          documentModelDocumentModelModule as unknown as DocumentModelModule,
        ])
        .withExecutorConfig({
          featureFlags: authEnforcement
            ? { documentDecisions: true, authEnforcement: true }
            : {},
        })
        .withTrustPolicy(trustPolicy),
    )
    .buildModule();
  const client = await clientOver(publisherSigner, built);

  await client.create(
    withSignaturePolicy(Connection.utils.createDocument(), "legacy", {
      id: "conn-open",
    }),
  );
  await client.execute("conn-open", "main", [
    connectionActions.setConnector({
      connectorId: REACTOR_CONNECTOR_ID,
      authType: "REACTOR",
    }),
    connectionActions.setConfig({ config: { endpoint: "local" } }),
  ]);

  const { db } = getDbClient();
  const relationalDb = createRelationalDb(
    db as unknown as Kysely<unknown>,
  ) as IRelationalDb;
  const pieces = new Map([
    [root, [{ name: PIECE, version: PIECE_VERSION, bundleDir: pieceBundle }]],
  ]);
  const runtime = await composeWorkflowRuntime({
    reactorClient: built.client,
    clientModule: built,
    relationalDb,
    attachments: {} as never,
    authorizationService: OPEN,
    pieces: { getPieces: () => pieces, onPiecesChange: () => undefined },
    logger,
  });
  const subgraph = new runtime.subgraph({
    reactorClient: built.client,
    authorizationService: OPEN,
    relationalDb,
  } as never);
  const resolvers = subgraph.resolvers as Record<
    string,
    Record<string, Resolver>
  >;
  return {
    module: built,
    publisher: client,
    composed: runtime,
    queries: resolvers.WorkflowRuntimeQueries,
    mutations: resolvers.WorkflowRuntimeMutations,
  };
}

const publish = () =>
  workflowActions.publishWorkflow({ publishedAt: new Date().toISOString() });

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "switchboard-enforcement-"));
  pieceBundle = join(root, "dist", "node", "pieces", "ops");
  await mkdir(pieceBundle, { recursive: true });
  await writeFile(
    join(pieceBundle, "package.json"),
    JSON.stringify({ name: PIECE, version: PIECE_VERSION, main: "index.js" }),
  );
  await writeFile(join(pieceBundle, "index.js"), SOURCE);

  hostSigner = await signerFor(HOST.address);
  publisherSigner = await signerFor(PUBLISHER.address);
  // A Renown user in their own right, whose key claims the publisher.
  attackerSigner = await signerFor(PUBLISHER.address);
  const rows = [
    credentialRow(await credentialFor(PUBLISHER, publisherSigner.app.key)),
    credentialRow(await credentialFor(ATTACKER, attackerSigner.app.key)),
  ];
  const trust = await getRenownTrustPolicyConfig(
    {
      source: "self",
      request: () => Promise.resolve({ renownCredentials: rows }),
    },
    { signer: hostSigner } as unknown as IRenown,
  );
  trustPolicy = trust.trustPolicy!;

  ({ module, publisher, composed, queries, mutations } = await harness(true));
}, 60_000);

afterAll(async () => {
  await composed.stop();
  module.reactor.kill();
  await rm(root, { recursive: true, force: true });
});

describe("signer trust", () => {
  const WORKFLOW = "wf-trust";

  beforeAll(async () => {
    await publisher.create(
      withSignaturePolicy(Workflow.utils.createDocument(), "legacy", {
        id: WORKFLOW,
      }),
    );
    await publisher.execute(WORKFLOW, "main", [
      initializeAuth({
        version: 1,
        grants: [
          grant(
            "publisher",
            { address: PUBLISHER.address },
            { can: "execute" },
          ),
          // Anyone may publish, so only the signature decides the run user.
          grant(
            "anyone",
            { anyone: true },
            { can: "execute", scope: "global" },
          ),
        ],
      }),
    ]);
    await publisher.execute(WORKFLOW, "main", [publish()]);
  });

  // Straight to the reactor, so no client signs or rewrites the claim.
  async function submitted(action: Action) {
    const job = await module.reactor.execute(WORKFLOW, "main", [action]);
    return module.client.waitForJob(job);
  }

  it("makes a credentialed publisher the run user", async () => {
    const runUser = await publishRunUser(module.client, WORKFLOW);
    expect(runUser?.address).toBe(PUBLISHER.address);
    expect(runUser?.subject.key).toBe(publisherSigner.app.key);
  });

  it("refuses a key that claims the publisher without their credential", async () => {
    const attacker = await clientOver(attackerSigner);

    await expect(
      attacker.execute(WORKFLOW, "main", [publish()]),
    ).rejects.toThrow(/may not sign as/);
    const runUser = await publishRunUser(module.client, WORKFLOW);
    expect(runUser?.subject.key).toBe(publisherSigner.app.key);
  });

  it("refuses a signature moved under the publisher's key", async () => {
    const action = publish();
    const forged = await attackerSigner.signAction(action, {
      documentId: WORKFLOW,
      branch: "main",
    } as never);
    const [timestamp, , hash, signature, ...rest] = forged;
    action.context = {
      signer: {
        user: user(PUBLISHER.address),
        app: { name: "connect", key: publisherSigner.app.key },
        signatures: [
          [timestamp, publisherSigner.app.key, hash, signature, ...rest],
        ],
      },
    } as Action["context"];

    await expect(submitted(action)).resolves.toMatchObject({
      status: "FAILED",
    });
    const runUser = await publishRunUser(module.client, WORKFLOW);
    expect(runUser?.subject.key).toBe(publisherSigner.app.key);
  });

  it("refuses an unsigned publish that claims the publisher", async () => {
    const action = publish();
    action.context = {
      signer: {
        user: user(PUBLISHER.address),
        app: { name: "connect", key: "" },
        signatures: [],
      },
    } as Action["context"];

    const job = await submitted(action);
    expect(job.status).toBe("FAILED");
    expect(JSON.stringify(job.error)).toMatch(/UNSIGNED_IDENTITY/);
    const runUser = await publishRunUser(module.client, WORKFLOW);
    expect(runUser?.subject.key).toBe(publisherSigner.app.key);
  });

  // mutateDocument has the host sign an action sent unsigned through GraphQL.
  it("does not make the Switchboard the run user of a publish it signs", async () => {
    await module.client.execute(WORKFLOW, "main", [publish()]);
    const hostIdentity = hostIdentityOf(reactorAccessOf(module));
    expect(hostIdentity).toEqual({
      address: HOST.address,
      key: hostSigner.app.key,
    });
    await expect(
      publishRunUser(module.client, WORKFLOW, hostIdentity),
    ).resolves.toBeNull();
  });
});

describe("a run, as its run user", () => {
  const WORKFLOW = "wf-ops";
  // What the editor grants the Switchboard: global-scope execute.
  const hostGrant = grant(
    "switchboard",
    { address: HOST.address },
    { can: "execute", scope: "global" },
  );
  // And the document-scope operations of a create in a drive and a delete.
  const hostDocumentGrant = grant(
    "switchboard:document",
    { address: HOST.address },
    {
      can: "execute",
      scope: "document",
      operation: ["DELETE_DOCUMENT", "ADD_RELATIONSHIP", "REMOVE_RELATIONSHIP"],
    },
  );
  const runUserGrant = grant(
    "run-user",
    { address: PUBLISHER.address },
    { can: "execute" },
  );
  let round = 0;

  beforeAll(async () => {
    await publisher.create(
      withSignaturePolicy(Workflow.utils.createDocument(), "legacy", {
        id: WORKFLOW,
      }),
    );
    await publisher.execute(WORKFLOW, "main", [
      ...["rename", "read", "delete"].map((actionName) =>
        workflowActions.addStep({
          id: actionName,
          key: actionName,
          name: actionName,
          pieceName: PIECE,
          pieceVersion: PIECE_VERSION,
          actionName,
          config: {},
          reactorConnectionId: "conn-open",
        }),
      ),
      publish(),
    ]);
  });

  async function target(grants: Grant[]) {
    const id = `ops-${++round}`;
    await createDocument(documentModelDocumentModelModule as never, id, [
      ...grants,
      // Lets the publisher set the document up; no one else may read it.
      grant("owner", { address: PUBLISHER.address }, { can: "execute" }),
    ]);
    return id;
  }

  async function step(stepId: string, id: string) {
    await publisher.execute(WORKFLOW, "main", [
      workflowActions.updateStep({ id: stepId, config: { id } }),
    ]);
    return (await mutations.testStep(
      {},
      { workflowId: WORKFLOW, stepId },
      ctxOf(PUBLISHER.address),
    )) as StepResult;
  }

  async function unreadable() {
    const id = `ops-${++round}`;
    await createDocument(documentModelDocumentModelModule as never, id, [
      grant("host-only", { address: HOST.address }, { can: "execute" }),
    ]);
    return id;
  }

  it("lands a write the run user and the Switchboard may both make", async () => {
    const id = await target([runUserGrant, hostGrant]);

    expect(await step("rename", id)).toMatchObject({
      status: "SUCCEEDED",
      output: "Renamed",
    });
  }, 60_000);

  it("refuses a write the document's policy denies the run user", async () => {
    const id = await unreadable();

    const result = await step("rename", id);

    expect(result).toMatchObject({
      status: "FAILED",
      errorName: "ReactorAccessDeniedError",
    });
    expect(result.error).toContain("The run user may not apply SET_NAME");
    expect((await module.client.get(id)).header.name).toBe("");
  }, 60_000);

  it("names the Switchboard's missing grant when admission refuses it", async () => {
    const id = await target([runUserGrant]);

    const result = await step("rename", id);

    expect(result).toMatchObject({
      status: "FAILED",
      errorName: "ReactorAccessDeniedError",
    });
    expect(result.error).toContain(
      "The Switchboard has no grant for this operation:",
    );
    expect(result.error).toContain(`${HOST.address} may not execute SET_NAME`);
  }, 60_000);

  it("reads as the run user", async () => {
    const readable = await target([runUserGrant]);
    const hidden = await unreadable();

    expect(await step("read", readable)).toMatchObject({
      status: "SUCCEEDED",
      output: 1,
    });
    expect(await step("read", hidden)).toMatchObject({
      status: "SUCCEEDED",
      output: 0,
    });
  }, 60_000);

  it("deletes only what the run user may delete", async () => {
    const allowed = await target([runUserGrant, hostGrant, hostDocumentGrant]);
    const denied = await unreadable();

    const removed = await step("delete", allowed);
    expect(removed.error).toBeUndefined();
    expect(removed).toMatchObject({
      status: "SUCCEEDED",
    });
    const deleted = await module.client.get(allowed).then(
      (document) => document.state.document.isDeleted === true,
      () => true,
    );
    expect(deleted).toBe(true);
    const refused = await step("delete", denied);
    expect(refused).toMatchObject({
      status: "FAILED",
      errorName: "ReactorAccessDeniedError",
    });
    expect(refused.error).toContain("DELETE_DOCUMENT");
  }, 60_000);

  it("refuses a run whose run user may not read its reactor connection", async () => {
    const connection = "conn-private";
    const workflowId = "wf-private";
    await createDocument(Connection as never, connection, [
      grant("host-only", { address: HOST.address }, { can: "execute" }),
    ]);
    await module.client.execute(connection, "main", [
      connectionActions.setConnector({
        connectorId: REACTOR_CONNECTOR_ID,
        authType: "REACTOR",
      }),
      connectionActions.setConfig({ config: { endpoint: "local" } }),
    ]);
    await createDocument(Workflow as never, workflowId, [
      grant("publisher", { address: PUBLISHER.address }, { can: "execute" }),
      hostGrant,
    ]);
    await publisher.execute(workflowId, "main", [
      workflowActions.setTrigger({
        id: "t1",
        pieceName: CORE_PIECE_NAME,
        pieceVersion: CORE_PIECE_VERSION,
        triggerName: "manual",
        config: {},
      }),
      workflowActions.addStep({
        id: "read",
        key: "read",
        name: "read",
        pieceName: PIECE,
        pieceVersion: PIECE_VERSION,
        actionName: "read",
        config: { id: connection },
        reactorConnectionId: connection,
      }),
      workflowActions.addEdge({
        id: "e1",
        from: "t1",
        to: "read",
        port: "next",
      }),
      publish(),
      workflowActions.setWorkflowStatus({ status: "ENABLED" }),
    ]);

    await expect(
      mutations.fire({}, { workflowId }, ctxOf(PUBLISHER.address)),
    ).rejects.toThrow(
      `${PUBLISHER.address} cannot read reactor connection "${connection}"`,
    );
  }, 60_000);
});

const HOST_SIGNED = /published unsigned or by the Switchboard itself/;

// Published by the publisher, then again through the host's own client, as
// mutateDocument signs an action sent unsigned.
async function hostSignedWorkflow(
  over: Harness,
  workflowId: string,
  target: string,
) {
  await createDocument(
    Workflow as unknown as DocumentModelModule,
    workflowId,
    [
      grant("publisher", { address: PUBLISHER.address }, { can: "execute" }),
      grant(
        "switchboard",
        { address: HOST.address },
        { can: "execute", scope: "global" },
      ),
    ],
    over.publisher,
  );
  await over.publisher.execute(workflowId, "main", [
    workflowActions.setTrigger({
      id: "t1",
      pieceName: CORE_PIECE_NAME,
      pieceVersion: CORE_PIECE_VERSION,
      triggerName: "manual",
      config: {},
    }),
    workflowActions.addStep({
      id: "rename",
      key: "rename",
      name: "rename",
      pieceName: PIECE,
      pieceVersion: PIECE_VERSION,
      actionName: "rename",
      config: { id: target },
      reactorConnectionId: "conn-open",
    }),
    workflowActions.addEdge({
      id: "e1",
      from: "t1",
      to: "rename",
      port: "next",
    }),
    publish(),
    workflowActions.setWorkflowStatus({ status: "ENABLED" }),
  ]);
  await over.module.client.execute(workflowId, "main", [publish()]);
}

const denialOf = (over: Harness, workflowId: string) =>
  over.queries.reactorAccessDenial(
    {},
    { workflowId },
    ctxOf(PUBLISHER.address),
  ) as Promise<string | null>;

describe("a publish the Switchboard signs, auth enforcement on", () => {
  const WORKFLOW = "wf-host-signed-on";

  it("gets no reactor access", async () => {
    const on = { module, publisher, composed, queries, mutations };
    await hostSignedWorkflow(on, WORKFLOW, "conn-open");

    await vi.waitFor(async () =>
      expect(await denialOf(on, WORKFLOW)).toMatch(HOST_SIGNED),
    );
    await expect(
      mutations.fire({}, { workflowId: WORKFLOW }, ctxOf(PUBLISHER.address)),
    ).rejects.toThrow(HOST_SIGNED);
  }, 60_000);
});

describe("a publish the Switchboard signs, auth enforcement off", () => {
  const WORKFLOW = "wf-host-signed-off";
  const TARGET = "off-target";
  let off: Harness;

  beforeAll(async () => {
    off = await harness(false);
  }, 60_000);

  afterAll(async () => {
    await off.composed.stop();
    off.module.reactor.kill();
  });

  it("runs with no run user, reading and writing", async () => {
    await createDocument(
      documentModelDocumentModelModule as never,
      TARGET,
      [grant("switchboard", { address: HOST.address }, { can: "execute" })],
      off.publisher,
    );
    await hostSignedWorkflow(off, WORKFLOW, TARGET);

    await expect(
      publishRunUser(
        off.module.client,
        WORKFLOW,
        hostIdentityOf(reactorAccessOf(off.module)),
      ),
    ).resolves.toBeNull();
    expect(await denialOf(off, WORKFLOW)).toBeNull();
    const result = (await off.mutations.fire(
      {},
      { workflowId: WORKFLOW },
      ctxOf(PUBLISHER.address),
    )) as { status: string; error?: string };
    expect(result.error).toBeUndefined();
    expect(result.status).toBe("SUCCEEDED");
    expect((await off.module.client.get(TARGET)).header.name).toBe("Renamed");
  }, 60_000);
});
