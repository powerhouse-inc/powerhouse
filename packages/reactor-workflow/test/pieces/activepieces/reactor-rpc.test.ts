// ctx.reactor over the reactor RPC: a third-party piece declaring
// requireReactor, real forked workers, a real in-process reactor.
import {
  DocumentModelUnavailableError,
  ReactorAccessDeniedError,
  ReactorActionsFailedError,
  ReactorRequestClosedError,
} from "@powerhousedao/pieces-framework";
import {
  ReactorBuilder,
  ReactorClientBuilder,
  type IReactorClient,
  type InProcessReactorClientModule,
  type ModelManifestEntry,
} from "@powerhousedao/reactor";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import {
  actions,
  withSignaturePolicy,
  type DocumentModelModule,
  type PHDocument,
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
import { documentModelDocumentModelModule } from "document-model";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  CORE_PIECE_NAME,
  CORE_PIECE_VERSION,
  createIpcTransport,
} from "../../../src/pieces/index.js";
import type { IPieceWorkerTransport } from "../../../src/pieces/activepieces/worker/transport.js";
import type { WorkflowRuntimeHostDeps } from "../../../src/reactor/host.js";
import { packagePieces } from "../../../src/reactor/piece-registry.js";
import { REACTOR_PIECE } from "../../../src/reactor/reactor-piece.js";
import type { WorkflowRuntimeService } from "../../../src/reactor/service.js";
import { testRuntime } from "../../helpers/runtime.js";
import { testSigner } from "../../helpers/signer.js";

const PIECE = "@acme/piece-reactor-probe";
const VERSION = "1.0.0";
const MODEL = "powerhouse/document-model";
const PUBLISHER = "0xpublisher";
const OTHER = "0xother";
const CONN_ALL = "conn-all";
// Types the host loads after the worker forks.
const LATE = "acme/late";
const LATER = "acme/later";
// Forked with version 1 only; the host loads 2 later.
const VERSIONED = "acme/versioned";
// In the boot manifest, but its module does not exist.
const BROKEN = "acme/broken";

const caller = (address: string) =>
  ({ headers: {}, db: {}, user: { address } }) as never;

const FIXTURE = `
import { addFile } from ${JSON.stringify(builtDriveActions())};
const MODEL = ${JSON.stringify(MODEL)};
const LATE = ${JSON.stringify(LATE)};
const id = { displayName: "Id", type: "SHORT_TEXT", required: false };
let stale;
let stalePage;

const errorOf = async (run) => {
  try {
    await run();
    return "reached";
  } catch (error) {
    return error.name;
  }
};

export const probe = {
  displayName: "Reactor probe",
  actions: {
    read: {
      name: "read",
      displayName: "Read",
      requireReactor: "read",
      props: { id },
      run: async (ctx) => {
        const document = await ctx.reactor.get(ctx.propsValue.id);
        return { id: document.header.id, name: document.header.name };
      },
    },
    rename: {
      name: "rename",
      displayName: "Rename",
      requireReactor: "write",
      props: { id, name: { displayName: "Name", type: "SHORT_TEXT", required: false } },
      run: async (ctx) => {
        const current = await ctx.reactor.get(ctx.propsValue.id);
        const model = await ctx.reactor.getDocumentModelModuleForDocument(current);
        const document = await ctx.reactor.execute(current.header.id, "main", [
          model.actions.setName(ctx.propsValue.name),
        ]);
        return { name: document.header.name };
      },
    },
    append: {
      name: "append",
      displayName: "Append to name",
      requireReactor: "write",
      props: { id },
      run: async (ctx) => {
        const current = await ctx.reactor.get(ctx.propsValue.id);
        const model = await ctx.reactor.getDocumentModelModuleForDocument(current);
        const document = await ctx.reactor.execute(current.header.id, "main", [
          model.actions.setName(current.header.name + "+"),
        ]);
        return { header: document.header, state: document.state };
      },
    },
    peek: {
      name: "peek",
      displayName: "Peek",
      requireReactor: "read",
      props: { id },
      run: async (ctx) => {
        const document = await ctx.reactor.get(ctx.propsValue.id);
        return { header: document.header, state: document.state };
      },
    },
    fail: {
      name: "fail",
      displayName: "Fail",
      props: {},
      run: async () => {
        throw new Error("Boom");
      },
    },
    "read-only-rename": {
      name: "read-only-rename",
      displayName: "Rename, declared read",
      requireReactor: "read",
      props: { id },
      run: async (ctx) => {
        const model = await ctx.reactor.getDocumentModelModule(MODEL);
        return ctx.reactor.execute(ctx.propsValue.id, "main", [model.actions.setName("Nope")]);
      },
    },
    refused: {
      name: "refused",
      displayName: "Refused",
      requireReactor: "write",
      props: { id },
      run: async (ctx) => {
        const refusal = async (run) => {
          try {
            await run();
            return "reached";
          } catch (error) {
            return { name: error.name, message: error.message };
          }
        };
        const lifecycle = {
          id: "delete-1",
          type: "DELETE_DOCUMENT",
          scope: "document",
          input: { documentId: ctx.propsValue.id },
          timestampUtcMs: new Date().toISOString(),
        };
        return {
          rename: await refusal(() => ctx.reactor.rename(ctx.propsValue.id, "Nope")),
          deleteDocuments: await refusal(() => ctx.reactor.deleteDocuments([ctx.propsValue.id])),
          cascade: await refusal(() => ctx.reactor.deleteDocument(ctx.propsValue.id, "cascade")),
          drives: typeof ctx.reactor.drives,
          lifecycle: await refusal(() =>
            ctx.reactor.execute(ctx.propsValue.id, "main", [lifecycle]),
          ),
        };
      },
    },
    "bad-name": {
      name: "bad-name",
      displayName: "Bad name",
      requireReactor: "write",
      props: { id },
      run: async (ctx) => {
        const model = await ctx.reactor.getDocumentModelModule(MODEL);
        const action = model.actions.setModelName({ name: "valid" });
        action.input = { name: 42 };
        return ctx.reactor.execute(ctx.propsValue.id, "main", [action]);
      },
    },
    "file-into-drive": {
      name: "file-into-drive",
      displayName: "File into drive",
      requireReactor: "write",
      props: { id },
      run: async (ctx) => {
        const model = await ctx.reactor.getDocumentModelModule(MODEL);
        const file = await ctx.reactor.create(model.utils.createDocument(), ctx.propsValue.id);
        const drive = await ctx.reactor.execute(ctx.propsValue.id, "main", [
          addFile({ id: file.header.id, name: "Filed", documentType: MODEL }),
        ]);
        return { fileId: file.header.id, nodes: drive.state.global.nodes };
      },
    },
    delete: {
      name: "delete",
      displayName: "Delete",
      requireReactor: "write",
      props: { id },
      run: async (ctx) => {
        await ctx.reactor.deleteDocument(ctx.propsValue.id);
        return { deleted: ctx.propsValue.id };
      },
    },
    pages: {
      name: "pages",
      displayName: "Pages",
      requireReactor: "read",
      props: {},
      run: async (ctx) => {
        const first = await ctx.reactor.find({ type: MODEL }, undefined, { cursor: "", limit: 1 });
        const second = await first.next();
        return {
          sizes: [first.results.length, second.results.length],
          ids: [...first.results, ...second.results].map((d) => d.header.id),
        };
      },
    },
    keep: {
      name: "keep",
      displayName: "Keep",
      requireReactor: "read",
      props: {},
      run: async (ctx) => {
        stale = ctx.reactor;
        stalePage = await ctx.reactor.find({ type: MODEL }, undefined, { cursor: "", limit: 1 });
        return { kept: true };
      },
    },
    "use-stale": {
      name: "use-stale",
      displayName: "Use stale",
      requireReactor: "read",
      props: { id },
      run: async (ctx) => ({
        get: await errorOf(() => stale.get(ctx.propsValue.id)),
        next: await errorOf(() => stalePage.next()),
        fresh: (await ctx.reactor.get(ctx.propsValue.id)).header.id,
      }),
    },
    create: {
      name: "create",
      displayName: "Create",
      requireReactor: "write",
      props: {},
      run: async (ctx) => {
        const model = await ctx.reactor.getDocumentModelModule(MODEL);
        const created = await ctx.reactor.create(model.utils.createDocument());
        return {
          id: created.header.id,
          type: created.header.documentType,
          reducer: typeof model.reducer,
        };
      },
    },
    "missing-model": {
      name: "missing-model",
      displayName: "Missing model",
      requireReactor: "read",
      props: {},
      run: async (ctx) => {
        try {
          await ctx.reactor.getDocumentModelModule("powerhouse/workflow");
          return { threw: false };
        } catch (error) {
          return { name: error.name, message: error.message };
        }
      },
    },
    "late-model": {
      name: "late-model",
      displayName: "Late model",
      requireReactor: "read",
      props: {},
      run: async (ctx) => {
        try {
          const model = await ctx.reactor.getDocumentModelModule(LATE);
          return { type: model.documentModel.global.id, reducer: typeof model.reducer };
        } catch (error) {
          return { name: error.name };
        }
      },
    },
    "model-for-v2": {
      name: "model-for-v2",
      displayName: "Model for a version 2 document",
      requireReactor: "read",
      props: { id },
      run: async (ctx) => {
        const document = await ctx.reactor.get(ctx.propsValue.id);
        document.state.document = { ...document.state.document, version: 2 };
        try {
          const model = await ctx.reactor.getDocumentModelModuleForDocument(document);
          return { version: model.version };
        } catch (error) {
          return { name: error.name };
        }
      },
    },
    "list-models": {
      name: "list-models",
      displayName: "List models",
      requireReactor: "read",
      props: {},
      run: async (ctx) => {
        const page = await ctx.reactor.getDocumentModelModules();
        return { types: page.results.map((m) => m.documentModel.global.id) };
      },
    },
    pick: {
      name: "pick",
      displayName: "Pick",
      requireReactor: "write",
      props: {
        document: {
          displayName: "Document",
          type: "DROPDOWN",
          required: false,
          refreshers: [],
          options: async (_values, ctx) => {
            const page = await ctx.reactor.find({ type: MODEL });
            const model = await ctx.reactor.getDocumentModelModule(MODEL);
            const write = await errorOf(() =>
              ctx.reactor.execute(page.results[0].header.id, "main", [model.actions.setName("x")]),
            );
            return {
              options: page.results.map((d) => ({ label: write, value: d.header.id })),
            };
          },
        },
      },
      run: async () => ({}),
    },
    undeclared: {
      name: "undeclared",
      displayName: "Undeclared",
      props: {},
      run: async (ctx) => ({ reactor: await errorOf(() => ctx.reactor.get("x")) }),
    },
  },
  triggers: {
    watch: {
      name: "watch",
      displayName: "Watch",
      type: "POLLING",
      requireReactor: "read",
      props: { id, other: id },
      onEnable: async () => undefined,
      onDisable: async () => undefined,
      run: async () => [],
      test: async (ctx) => [
        {
          name: (await ctx.reactor.get(ctx.propsValue.id)).header.name,
          other: await errorOf(() => ctx.reactor.get(ctx.propsValue.other)),
        },
      ],
    },
  },
};
`;

let dir = "";
let builder: ReactorBuilder;
let module: InProcessReactorClientModule;
let publisher: IReactorClient;
let service: WorkflowRuntimeService;
const docs: string[] = [];
// Readers per document; absent means anyone.
const readers = new Map<string, Set<string>>();

const assertCanRead: WorkflowRuntimeHostDeps["assertCanRead"] = (
  documentId,
  ctx,
) => {
  const allowed = readers.get(documentId);
  const address = (ctx as { user?: { address?: string } }).user?.address;
  return !allowed || (address && allowed.has(address))
    ? Promise.resolve()
    : Promise.reject(new Error("Forbidden"));
};

// The built entry: the worker imports dist, not the source vitest resolves.
function builtModule(name: string): string {
  let dir = dirname(fileURLToPath(import.meta.resolve(name)));
  while (!existsSync(join(dir, "package.json"))) dir = dirname(dir);
  return join(dir, "dist", "index.js");
}

function modelManifest(): ModelManifestEntry[] {
  return [
    {
      documentType: MODEL,
      version: "1",
      spec: {
        module: {
          filePath: builtModule("document-model"),
          exportName: "documentModelDocumentModelModule",
        },
      },
    },
    {
      documentType: VERSIONED,
      version: "1",
      spec: {
        module: {
          filePath: join(dir, "versioned-models.mjs"),
          exportName: "versionedV1",
        },
      },
    },
    {
      documentType: BROKEN,
      version: "1",
      spec: {
        module: { filePath: join(dir, "missing.mjs"), exportName: "broken" },
      },
    },
  ];
}

// The drive action creators, importable by path from the piece's own module.
function builtDriveActions(): string {
  let dir = dirname(
    fileURLToPath(import.meta.resolve("@powerhousedao/shared/document-drive")),
  );
  while (!existsSync(join(dir, "package.json"))) dir = dirname(dir);
  return pathToFileURL(join(dir, "dist", "document-drive", "index.js")).href;
}

// The document model under another type, importable by path like a package's.
function modelsAs(exports: Record<string, [string, number]>): string {
  const base = JSON.stringify(
    pathToFileURL(builtModule("document-model")).href,
  );
  return [
    `import { documentModelDocumentModelModule as base } from ${base};`,
    ...Object.entries(exports).map(
      ([name, [type, version]]) =>
        `export const ${name} = { ...base, version: ${version}, documentModel: { ...base.documentModel, global: { ...base.documentModel.global, id: ${JSON.stringify(type)} } } };`,
    ),
  ].join("\n");
}

// Creating a document of a late type makes the host's loader register it.
async function loadLate(documentType: string): Promise<void> {
  const document = withSignaturePolicy(
    documentModelDocumentModelModule.utils.createDocument(),
    "legacy",
  );
  document.header.documentType = documentType;
  await publisher.create(document);
}

async function createDocument(
  model: DocumentModelModule,
  id?: string,
): Promise<string> {
  const document = withSignaturePolicy(
    model.utils.createDocument(),
    "legacy",
    id ? { id } : undefined,
  );
  await publisher.create(document);
  return document.header.id;
}

async function reactorConnection(id: string, config: unknown) {
  await createDocument(Connection as never, id);
  await publisher.execute(id, "main", [
    connectionActions.setConnector({
      connectorId: REACTOR_CONNECTOR_ID,
      authType: "REACTOR",
    }),
    connectionActions.setConfig({ config }),
  ]);
}

interface StepSpec {
  actionName: string;
  config?: Record<string, unknown>;
  reactorConnectionId?: string;
}

let workflows = 0;

// A manual workflow of piece steps in order; published when asked.
async function workflow(
  steps: StepSpec[],
  options: {
    publish?: boolean;
    trigger?: { config: Record<string, unknown>; reactorConnectionId: string };
  } = {},
): Promise<string> {
  const id = `wf-${++workflows}`;
  await createDocument(Workflow as never, id);
  const stepActions = steps.map((step, index) =>
    workflowActions.addStep({
      id: `s${index + 1}`,
      key: `${step.actionName}-${index + 1}`,
      name: step.actionName,
      pieceName: PIECE,
      pieceVersion: VERSION,
      actionName: step.actionName,
      config: step.config ?? {},
      reactorConnectionId: step.reactorConnectionId ?? CONN_ALL,
    }),
  );
  const edges = steps.map((_, index) =>
    workflowActions.addEdge({
      id: `e${index + 1}`,
      from: index === 0 ? "t1" : `s${index}`,
      to: `s${index + 1}`,
      port: "next",
    }),
  );
  await publisher.execute(id, "main", [
    workflowActions.setWorkflowName({ name: id }),
    options.trigger
      ? workflowActions.setTrigger({
          id: "t1",
          pieceName: PIECE,
          pieceVersion: VERSION,
          triggerName: "watch",
          config: options.trigger.config,
          reactorConnectionId: options.trigger.reactorConnectionId,
        })
      : workflowActions.setTrigger({
          id: "t1",
          pieceName: CORE_PIECE_NAME,
          pieceVersion: CORE_PIECE_VERSION,
          triggerName: "manual",
          config: {},
        }),
    ...stepActions,
    ...edges,
    ...(options.publish
      ? [
          workflowActions.publishWorkflow({
            publishedAt: "2026-10-02T10:00:00.000Z",
          }),
          workflowActions.setWorkflowStatus({ status: "ENABLED" }),
        ]
      : []),
  ]);
  return id;
}

async function nameOf(id: string): Promise<string> {
  return (await publisher.get<PHDocument>(id)).header.name;
}

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "ph-reactor-rpc-"));
  const entryPath = join(dir, "index.mjs");
  await writeFile(entryPath, FIXTURE);
  packagePieces.setPieces([{ name: PIECE, version: VERSION, entryPath }]);
  const lateModelsPath = join(dir, "late-models.mjs");
  await writeFile(
    lateModelsPath,
    modelsAs({ late: [LATE, 1], later: [LATER, 1] }),
  );
  await writeFile(
    join(dir, "versioned-models.mjs"),
    modelsAs({ versionedV1: [VERSIONED, 1], versionedV2: [VERSIONED, 2] }),
  );
  const exports: Record<string, string> = { [LATE]: "late", [LATER]: "later" };

  builder = new ReactorBuilder()
    .withDocumentModelSources([
      Workflow as unknown as DocumentModelModule,
      Connection as unknown as DocumentModelModule,
      documentModelDocumentModelModule as unknown as DocumentModelModule,
      driveDocumentModelModule as unknown as DocumentModelModule,
    ])
    .withDocumentModelLoader({
      load: (documentType) =>
        documentType === VERSIONED
          ? Promise.resolve({ filePath: join(dir, "versioned-models.mjs") })
          : exports[documentType]
            ? Promise.resolve({
                filePath: lateModelsPath,
                exportName: exports[documentType],
              })
            : Promise.reject(new Error(`No model for ${documentType}`)),
    });
  module = await new ReactorClientBuilder()
    .withReactorBuilder(builder)
    .buildModule();
  publisher = await new ReactorClientBuilder()
    .withReactor(
      module.reactor,
      module.eventBus,
      module.documentIndexer,
      module.documentView,
    )
    .withSigner(await testSigner(PUBLISHER))
    .build();

  for (let i = 0; i < 3; i++) {
    docs.push(
      await createDocument(
        documentModelDocumentModelModule as unknown as DocumentModelModule,
      ),
    );
  }
  // Only the publisher may read the second.
  readers.set(docs[1], new Set([PUBLISHER]));
  await reactorConnection(CONN_ALL, { endpoint: "local" });

  service = runtime();
}, 60_000);

function runtime(): WorkflowRuntimeService {
  return testRuntime({
    reactorClient: publisher,
    assertCanRead,
    subjectOf: (ctx) => ({
      address: (ctx as { user?: { address?: string } }).user?.address,
    }),
    authEnforcement: false,
    modelManifest,
    modelEntries: (documentType) => builder.getImportableEntries(documentType),
  });
}

afterAll(async () => {
  service.shutdown();
  packagePieces.reset();
  module.reactor.kill();
  await rm(dir, { recursive: true, force: true });
});

async function testStep(step: StepSpec, as = OTHER) {
  const id = await workflow([step]);
  return service.testStep(id, "s1", caller(as));
}

describe("ctx.reactor over the reactor RPC", () => {
  it("reads and writes as the run user", async () => {
    const id = await workflow(
      [
        { actionName: "read", config: { id: docs[1] } },
        { actionName: "rename", config: { id: docs[0], name: "Renamed" } },
      ],
      { publish: true },
    );
    // Fired by another user, run as the publisher: the second document is
    // the publisher's alone, so the firer is handed no step outputs.
    const run = await service.fire(
      id,
      undefined,
      "manual",
      undefined,
      caller(OTHER),
    );

    expect(run).toMatchObject({ status: "SUCCEEDED", steps: [] });
    const store = (await service.store())!;
    const rows = await store.getSteps(run.runId!);
    expect(rows.map((row) => JSON.parse(row.output!) as unknown)).toEqual([
      { id: docs[1], name: "" },
      { name: "Renamed" },
    ]);
    expect(await nameOf(docs[0])).toBe("Renamed");
    expect(await store.getRunDocuments(run.runId!)).toEqual(
      expect.arrayContaining([docs[0], docs[1]]),
    );
  }, 60_000);

  it("a rerun reuses a write's document output and re-reads a read's", async () => {
    const target = await createDocument(
      documentModelDocumentModelModule as unknown as DocumentModelModule,
    );
    const id = await workflow(
      [
        { actionName: "append", config: { id: target } },
        { actionName: "peek", config: { id: target } },
        { actionName: "fail" },
      ],
      { publish: true },
    );
    const run = await service.fire(
      id,
      undefined,
      "manual",
      undefined,
      caller(PUBLISHER),
    );
    expect(run.status).toBe("FAILED");
    expect(await nameOf(target)).toBe("+");

    const rerun = await service.rerun(run.runId!, caller(PUBLISHER));

    expect(rerun.steps.map((step) => [step.key, step.status])).toEqual([
      ["append-1", "REPLAYED"],
      ["peek-2", "SUCCEEDED"],
      ["fail-3", "FAILED"],
    ]);
    expect(await nameOf(target)).toBe("+");
  }, 60_000);

  it("refuses a write the declaration does not cover", async () => {
    const result = await testStep({
      actionName: "read-only-rename",
      config: { id: docs[2] },
    });

    expect(result.status).toBe("FAILED");
    expect(result.error).toContain(ReactorAccessDeniedError);
    expect(result.error).toContain("declares read access only");
    expect(await nameOf(docs[2])).toBe("");
  }, 60_000);

  it("refuses the client's convenience writes by name", async () => {
    const result = await testStep({
      actionName: "refused",
      config: { id: docs[2] },
    });

    expect(result).toMatchObject({
      status: "SUCCEEDED",
      output: {
        rename: {
          name: ReactorAccessDeniedError,
          message: "rename is not available to workflow pieces",
        },
        deleteDocuments: {
          name: ReactorAccessDeniedError,
          message: "deleteDocuments is not available to workflow pieces",
        },
        cascade: {
          name: ReactorAccessDeniedError,
          message: "Cascade delete is not offered to pieces",
        },
        drives: "undefined",
        lifecycle: {
          name: ReactorAccessDeniedError,
          message:
            "DELETE_DOCUMENT is a document lifecycle action, which pieces may not execute",
        },
      },
    });
    expect(await nameOf(docs[2])).toBe("");
  }, 60_000);

  it("files a document into a drive with create and an ADD_FILE built by addFile", async () => {
    const drive = await publisher.drives.create({ global: { name: "Files" } });

    const result = await testStep({
      actionName: "file-into-drive",
      config: { id: drive.header.id },
    });

    expect(result.status).toBe("SUCCEEDED");
    const { fileId, nodes } = result.output as {
      fileId: string;
      nodes: unknown[];
    };
    expect(nodes).toEqual([
      expect.objectContaining({ id: fileId, kind: "file", name: "Filed" }),
    ]);
    // The same drive file drives.addFile makes: a node and a child edge.
    const edges = await publisher.getIncomingRelationshipEdges(fileId, "child");
    expect(edges.results.map((edge) => edge.sourceId)).toEqual([
      drive.header.id,
    ]);
  }, 60_000);

  it("deletes a document without a cascade", async () => {
    const target = await createDocument(
      documentModelDocumentModelModule as unknown as DocumentModelModule,
    );

    const result = await testStep({
      actionName: "delete",
      config: { id: target },
    });

    expect(result).toMatchObject({
      status: "SUCCEEDED",
      output: { deleted: target },
    });
    const deleted = await publisher.get<PHDocument>(target).then(
      (document) => document.state.document.isDeleted === true,
      () => true,
    );
    expect(deleted).toBe(true);
  }, 60_000);

  it("fails the step with ReactorActionsFailedError on a reducer error", async () => {
    const result = await testStep({
      actionName: "bad-name",
      config: { id: docs[2] },
    });

    expect(result.status).toBe("FAILED");
    expect(result.error).toContain(ReactorActionsFailedError);
  }, 60_000);

  it("pages with next() within a step", async () => {
    const result = await testStep({ actionName: "pages" });

    expect(result.status).toBe("SUCCEEDED");
    const output = result.output as { sizes: number[]; ids: string[] };
    expect(output.sizes).toEqual([1, 1]);
    expect(new Set(output.ids).size).toBe(2);
  }, 60_000);

  it("closes a ctx.reactor and its pages when the step settles", async () => {
    const id = await workflow(
      [
        { actionName: "keep" },
        { actionName: "use-stale", config: { id: docs[0] } },
      ],
      { publish: true },
    );
    const run = await service.fire(
      id,
      undefined,
      "manual",
      undefined,
      caller(OTHER),
    );

    expect(run.status).toBe("SUCCEEDED");
    expect(run.steps[1]?.output).toEqual({
      get: ReactorRequestClosedError,
      next: ReactorRequestClosedError,
      fresh: docs[0],
    });
  }, 60_000);

  it("loads a model from the manifest, so its utils run in the worker", async () => {
    const result = await testStep({ actionName: "create" });

    expect(result.status).toBe("SUCCEEDED");
    const output = result.output as {
      id: string;
      type: string;
      reducer: string;
    };
    expect(output).toMatchObject({ type: MODEL, reducer: "function" });
    expect(
      (await publisher.get<PHDocument>(output.id)).header.documentType,
    ).toBe(MODEL);
  }, 60_000);

  it("throws DocumentModelUnavailableError for a type with no entry", async () => {
    const result = await testStep({ actionName: "missing-model" });

    expect(result).toMatchObject({
      status: "SUCCEEDED",
      output: { name: DocumentModelUnavailableError },
    });
  }, 60_000);

  it("looks up a model the host loaded after the worker forked", async () => {
    expect(await testStep({ actionName: "late-model" })).toMatchObject({
      status: "SUCCEEDED",
      output: { name: DocumentModelUnavailableError },
    });

    await loadLate(LATE);

    expect(await testStep({ actionName: "late-model" })).toMatchObject({
      status: "SUCCEEDED",
      output: { type: LATE, reducer: "function" },
    });
  }, 60_000);

  it("lists models the host loaded after the worker forked", async () => {
    await loadLate(LATER);

    const result = await testStep({ actionName: "list-models" });

    expect(result.status).toBe("SUCCEEDED");
    expect((result.output as { types: string[] }).types).toEqual(
      expect.arrayContaining([MODEL, LATER]),
    );
  }, 60_000);

  it("lists the models that load, leaving out one that fails", async () => {
    const result = await testStep({ actionName: "list-models" });

    expect(result.status).toBe("SUCCEEDED");
    const types = (result.output as { types: string[] }).types;
    expect(types).toEqual(expect.arrayContaining([MODEL, VERSIONED]));
    expect(types).not.toContain(BROKEN);
  }, 60_000);

  it("looks up a version the worker's manifest lacks", async () => {
    await loadLate(VERSIONED);
    const target = (
      await publisher.find({ type: VERSIONED }, undefined, {
        cursor: "",
        limit: 1,
      })
    ).results[0]!.header.id;

    const result = await testStep({
      actionName: "model-for-v2",
      config: { id: target },
    });

    expect(result).toMatchObject({
      status: "SUCCEEDED",
      output: { version: 2 },
    });
  }, 60_000);

  it("re-checks reactor access when seeding after a restart", async () => {
    // Watches documents; its step reads through the given connection.
    const watcher = async (reactorConnectionId: string) => {
      const id = `wf-${++workflows}`;
      await createDocument(Workflow as never, id);
      await publisher.execute(id, "main", [
        workflowActions.setTrigger({
          id: "t1",
          pieceName: REACTOR_PIECE,
          pieceVersion: "1.0.0",
          triggerName: "document-event",
          config: { documentType: MODEL },
        }),
        workflowActions.addStep({
          id: "s1",
          key: "read",
          name: "read",
          pieceName: PIECE,
          pieceVersion: VERSION,
          actionName: "read",
          config: { id: docs[0] },
          reactorConnectionId,
        }),
        workflowActions.addEdge({
          id: "e1",
          from: "t1",
          to: "s1",
          port: "next",
        }),
        workflowActions.publishWorkflow({
          publishedAt: "2026-10-02T10:00:00.000Z",
        }),
        workflowActions.setWorkflowStatus({ status: "ENABLED" }),
      ]);
      return id;
    };
    const denied = await watcher("conn-missing");
    const allowed = await watcher(CONN_ALL);

    const restarted = runtime();
    await restarted.seedFailure();
    // The registry is what a matching operation fires from.
    const armed = (id: string) =>
      (restarted as unknown as { registry: Map<string, unknown> }).registry.has(
        id,
      );

    expect(restarted.reactorAccessDenial(denied)).toContain(
      `cannot read reactor connection "conn-missing"`,
    );
    expect(armed(denied)).toBe(false);
    expect(restarted.reactorAccessDenial(allowed)).toBeUndefined();
    expect(armed(allowed)).toBe(true);
    restarted.shutdown();
  }, 60_000);

  it("gives an undeclared action no ctx.reactor", async () => {
    const result = await testStep({ actionName: "undeclared" });

    expect(result).toMatchObject({
      status: "SUCCEEDED",
      output: { reactor: "UnsupportedContextMemberError" },
    });
  }, 60_000);

  it("resolves design-time options reading as the caller, without writes", async () => {
    const block = {
      pieceName: PIECE,
      pieceVersion: VERSION,
      kind: "action" as const,
      name: "pick",
    };
    const options = async (as: string) =>
      (
        (await service.blockOptions(
          block,
          "document",
          {},
          undefined,
          caller(as),
        )) as {
          options: { label: string; value: string }[];
        }
      ).options;

    const asOther = await options(OTHER);
    const values = asOther.map((option) => option.value);
    expect(values).toEqual(expect.arrayContaining(docs));
    expect(asOther[0]?.label).toBe(ReactorAccessDeniedError);
  }, 60_000);

  it("serves a trigger hook its bound connection", async () => {
    const id = await workflow(
      [{ actionName: "read", config: { id: docs[0] } }],
      {
        trigger: {
          config: { id: docs[0], other: docs[2] },
          reactorConnectionId: CONN_ALL,
        },
      },
    );
    await publisher.execute(docs[0], "main", [actions.setName("Watched")]);

    const sample = await service.testTrigger(id, caller(OTHER));

    expect(sample).toEqual([{ name: "Watched", other: "reached" }]);
  }, 60_000);
});

describe("createIpcTransport", () => {
  // A child's channel: what the host sent, and a way to deliver as the child.
  function channel() {
    const listeners = new Set<(message: unknown) => void>();
    const sent: unknown[] = [];
    const worker = {
      connected: true,
      send: (message: unknown) => sent.push(message),
      on: (_event: string, listener: (message: unknown) => void) =>
        listeners.add(listener),
      off: (_event: string, listener: (message: unknown) => void) =>
        listeners.delete(listener),
      kill: () => undefined,
    } as unknown as IPieceWorkerTransport;
    const deliver = (message: unknown) => {
      for (const listener of [...listeners]) listener(message);
    };
    return { worker, sent, deliver, listeners };
  }

  it("serves only its own request's RPC messages, until closed", () => {
    const { worker, sent, deliver, listeners } = channel();
    const transport = createIpcTransport(worker, "req-1");
    const received: unknown[] = [];
    transport.onMessage(((message: unknown) => {
      received.push(message);
    }) as never);

    const request = { k: "req", id: "r1", method: "get", args: [] };
    deliver({ type: "reactor-rpc", requestId: "req-1", message: request });
    deliver({ type: "reactor-rpc", requestId: "req-0", message: request });
    deliver({ type: "reactor-rpc", requestId: "req-1", message: "no kind" });
    deliver({ id: 1, type: "host-call", method: "store.get", payload: {} });
    const reply = { k: "res", id: "r1", value: 1 };
    transport.post(reply as never);

    expect(received).toEqual([request]);
    expect(sent).toEqual([
      { type: "reactor-rpc", requestId: "req-1", message: reply },
    ]);

    transport.close();
    deliver({ type: "reactor-rpc", requestId: "req-1", message: request });
    transport.post(reply as never);
    expect(received).toHaveLength(1);
    expect(sent).toHaveLength(1);
    expect(listeners.size).toBe(0);
  });
});
