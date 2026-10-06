// The Switchboard's workflow runtime and its subgraph, composed over a real
// reactor with grants, with auth enforcement on and off (ADR 0005 §5-§9).
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ReactorBuilder,
  ReactorClientBuilder,
  type IReactorClient,
  type InProcessReactorClientModule,
} from "@powerhousedao/reactor";
import {
  AuthorizationPolicy,
  getDbClient,
  type Context,
  type IAuthorizationService,
} from "@powerhousedao/reactor-api";
import {
  initializeAuth,
  withSignaturePolicy,
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
  type ConnectionDocument,
} from "@powerhousedao/workflow/document-models/connection";
import {
  Workflow,
  actions as workflowActions,
} from "@powerhousedao/workflow/document-models/workflow";
import {
  MemoryKeyStorage,
  RenownCryptoBuilder,
  RenownCryptoSigner,
} from "@renown/sdk/node";
import type { ILogger } from "document-model";
import { documentModelDocumentModelModule } from "document-model";
import type { Kysely } from "kysely";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  composeWorkflowRuntime,
  type ComposedWorkflowRuntime,
} from "../src/workflow-runtime.mjs";

const PIECE = "@powerhousedao/piece-switchboard-docs";
const PIECE_VERSION = "1.0.0";
const PUBLISHER = "0xpublisher";
const OTHER = "0xother";
const HOST = "0xhost";

const SOURCE = `
const action = (name, requireReactor) => ({
  name,
  displayName: name,
  description: name,
  requireAuth: false,
  requireReactor,
  props: {},
  run: async () => undefined,
});
module.exports = {
  app: {
    displayName: "Docs",
    description: "Works with documents",
    logoUrl: "https://example.com/docs.png",
    categories: [],
    actions: {
      create_doc: {
        ...action("create_doc", "write"),
        run: async (ctx) => {
          const doc = await ctx.reactor.createEmpty("powerhouse/document-model");
          return { id: doc.header.id };
        },
      },
      pick_doc: {
        ...action("pick_doc", "read"),
        props: {
          document: {
            displayName: "Document",
            type: "DROPDOWN",
            required: false,
            refreshers: [],
            options: async (_values, ctx) => {
              const page = await ctx.reactor.find({
                type: "powerhouse/document-model",
              });
              return {
                options: page.results.map((d) => ({
                  label: d.header.id,
                  value: d.header.id,
                })),
              };
            },
          },
        },
      },
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

const ctxOf = (address?: string) =>
  ({
    headers: {},
    db: {},
    user: address ? { address, appKey: undefined } : undefined,
  }) as unknown as Context;

const grant = (
  id: string,
  principal: Grant["principal"],
  capability: Grant["capability"],
): Grant => ({ id, description: id, effect: "allow", principal, capability });

async function signerFor(address: string): Promise<ISigner> {
  const crypto = await new RenownCryptoBuilder()
    .withKeyPairStorage(new MemoryKeyStorage())
    .build();
  return new RenownCryptoSigner(crypto, "test", {
    address,
    networkId: "eip155",
    chainId: 1,
  });
}

const OPEN: IAuthorizationService = {
  config: {
    admins: [],
    defaultProtection: false,
    policy: AuthorizationPolicy.OPEN,
  },
  isSupremeAdmin: () => true,
  canCreate: () => true,
  canRead: () => Promise.resolve(true),
  canWrite: () => Promise.resolve(true),
  canManage: () => Promise.resolve(true),
  canMutate: () => Promise.resolve(true),
};

type Resolver = (parent: unknown, args: unknown, ctx: Context) => unknown;

describe.each([
  { enforcement: false, label: "auth enforcement off" },
  { enforcement: true, label: "auth enforcement on" },
])("the Switchboard workflow runtime, $label", ({ enforcement }) => {
  let root = "";
  let module: InProcessReactorClientModule;
  let hostSigner: ISigner;
  let publisher: IReactorClient;
  let composed: ComposedWorkflowRuntime;
  let queries: Record<string, Resolver>;
  let mutations: Record<string, Resolver>;

  async function createDocument(
    client: IReactorClient,
    model: DocumentModelModule,
    id: string,
    grants?: Grant[],
  ) {
    await client.create(
      withSignaturePolicy(model.utils.createDocument(), "legacy", { id }),
    );
    if (grants) {
      await client.execute(id, "main", [
        initializeAuth({ version: 1, grants }),
      ]);
    }
  }

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), "switchboard-reactor-access-"));
    const bundle = join(root, "dist", "node", "pieces", "docs");
    await mkdir(bundle, { recursive: true });
    await writeFile(
      join(bundle, "package.json"),
      JSON.stringify({ name: PIECE, version: PIECE_VERSION, main: "index.js" }),
    );
    await writeFile(join(bundle, "index.js"), SOURCE);

    hostSigner = await signerFor(HOST);
    module = await new ReactorClientBuilder()
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
            featureFlags: enforcement
              ? { documentDecisions: true, authEnforcement: true }
              : {},
          })
          // Test keys hold no Renown credential.
          .withTrustPolicy({ authorizeSigner: () => Promise.resolve(true) }),
      )
      .buildModule();
    publisher = await new ReactorClientBuilder()
      .withReactor(
        module.reactor,
        module.eventBus,
        module.documentIndexer,
        module.documentView,
      )
      .withSigner(await signerFor(PUBLISHER))
      .build();

    // Only the publisher reads or writes the first; the host may write both.
    const publisherOnly = grant(
      "publisher",
      { address: PUBLISHER },
      { can: "execute" },
    );
    await createDocument(
      publisher,
      documentModelDocumentModelModule as never,
      "doc-publisher",
      [publisherOnly],
    );
    await createDocument(
      publisher,
      documentModelDocumentModelModule as never,
      "doc-shared",
      [publisherOnly, grant("host", { address: HOST }, { can: "execute" })],
    );
    await createDocument(publisher, Connection as never, "conn-open");
    await publisher.execute("conn-open", "main", [
      connectionActions.setConnector({
        connectorId: REACTOR_CONNECTOR_ID,
        authType: "REACTOR",
      }),
      connectionActions.setConfig({ config: { endpoint: "local" } }),
    ]);
    await createDocument(publisher, Workflow as never, "wf-create");
    await publisher.execute("wf-create", "main", [
      workflowActions.addStep({
        id: "create",
        key: "create",
        name: "create",
        pieceName: PIECE,
        pieceVersion: PIECE_VERSION,
        actionName: "create_doc",
        config: {},
        reactorConnectionId: "conn-open",
      }),
    ]);
    const authorizationService = OPEN;
    const { db } = getDbClient();
    const relationalDb = createRelationalDb(
      db as unknown as Kysely<unknown>,
    ) as IRelationalDb;
    const pieces = new Map([
      [root, [{ name: PIECE, version: PIECE_VERSION, bundleDir: bundle }]],
    ]);
    composed = await composeWorkflowRuntime({
      reactorClient: module.client,
      clientModule: module,
      relationalDb,
      attachments: {} as never,
      authorizationService,
      pieces: { getPieces: () => pieces, onPiecesChange: () => undefined },
      logger,
    });
    const subgraph = new composed.subgraph({
      reactorClient: module.client,
      authorizationService,
      relationalDb,
    } as never);
    const resolvers = subgraph.resolvers as Record<
      string,
      Record<string, Resolver>
    >;
    queries = resolvers.WorkflowRuntimeQueries;
    mutations = resolvers.WorkflowRuntimeMutations;
  });

  afterAll(async () => {
    await composed.stop();
    module.reactor.kill();
    await rm(root, { recursive: true, force: true });
  });

  it("tells any caller whether auth is enforced", () => {
    expect(queries.authEnforcement({}, {}, ctxOf())).toBe(enforcement);
    expect(queries.authEnforcement({}, {}, ctxOf(OTHER))).toBe(enforcement);
  });

  it("names the host's identity and the grant form to signed-in callers only", () => {
    expect(queries.reactorIdentity({}, {}, ctxOf())).toBeNull();
    expect(queries.authConditions({}, {}, ctxOf())).toBeNull();

    expect(queries.reactorIdentity({}, {}, ctxOf(OTHER))).toEqual({
      address: HOST,
      key: hostSigner.app?.key,
    });
    expect(queries.authConditions({}, {}, ctxOf(OTHER))).toBe(false);
  });

  it("resolves options reading as the caller", async () => {
    const options = async (caller: string, reactorConnectionId?: string) =>
      (
        (await queries.blockOptions(
          {},
          {
            block: {
              pieceName: PIECE,
              pieceVersion: PIECE_VERSION,
              kind: "action",
              name: "pick_doc",
            },
            propName: "document",
            ...(reactorConnectionId ? { reactorConnectionId } : {}),
          },
          ctxOf(caller),
        )) as { options: { value: string }[] }
      ).options.map((option) => option.value);

    expect(await options(PUBLISHER, "conn-open")).toEqual(
      expect.arrayContaining(["doc-publisher", "doc-shared"]),
    );
    // Both grant only named principals; the read gate serves OTHER neither.
    const asOther = await options(OTHER, "conn-open");
    expect(asOther).not.toContain("doc-publisher");
    expect(asOther).not.toContain("doc-shared");
  });

  it("grants the host on a document a run creates, so it can write it later", async () => {
    const result = (await mutations.testStep(
      {},
      { workflowId: "wf-create", stepId: "create" },
      ctxOf(PUBLISHER),
    )) as { status: string; error?: string | null; output: { id: string } };
    expect(result.error ?? undefined).toBeUndefined();
    expect(result.status).toBe("SUCCEEDED");
    const { id } = result.output;

    const created = await module.client.get(id);
    expect(created.state.auth.grants.map((g) => g.principal)).toEqual(
      expect.arrayContaining([{ address: PUBLISHER }, { address: HOST }]),
    );
    // The host signs this write; under enforcement it lands only with its grant.
    const renamed = await module.client.execute(id, "main", [
      documentModelDocumentModelModule.actions.setModelName({ name: "Host" }),
    ]);
    expect(
      (renamed.state as unknown as { global: { name: string } }).global.name,
    ).toBe("Host");
  });

  it("checks a REACTOR connection's config instead of calling it unconfigured", async () => {
    const result = (await mutations.checkConnection(
      {},
      { connectionId: "conn-open" },
      ctxOf(PUBLISHER),
    )) as { ok: boolean; detail: string | null };

    expect(result).toMatchObject({
      ok: true,
      detail: "Local reactor, write access",
    });
    const connection = await module.client.get<ConnectionDocument>("conn-open");
    expect(connection.state.global.status).toBe("OK");
  });
});
