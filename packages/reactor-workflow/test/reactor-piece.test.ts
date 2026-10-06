// The reactor piece end to end: the built bundle runs in forked workers, and
// its ctx.reactor is a real in-process reactor served over the reactor RPC.
import {
  ReactorBuilder,
  ReactorClientBuilder,
  type IReactorClient,
  type InProcessReactorClientModule,
  type ModelManifestEntry,
} from "@powerhousedao/reactor";
import {
  driveDocumentModelModule,
  type DocumentDriveDocument,
} from "@powerhousedao/shared/document-drive";
import {
  withSignaturePolicy,
  type DocumentModelModule,
  type PHDocument,
} from "@powerhousedao/shared/document-model";
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
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  CORE_PIECE_NAME,
  CORE_PIECE_VERSION,
  type LocalPiece,
  type PackagePiece,
} from "../src/pieces/index.js";
import { ReactorAccessDeniedError } from "../src/reactor/reactor-errors.js";
import type { StepTestResult } from "../src/reactor/step-test.js";
import { packagePieces } from "../src/reactor/piece-registry.js";
import { REACTOR_PIECE } from "../src/reactor/reactor-piece.js";
import type { WorkflowRuntimeService } from "../src/reactor/service.js";
import { testRuntime } from "./helpers/runtime.js";
import { testSigner } from "./helpers/signer.js";

const CONNECTION = "powerhouse/connection";
const DRIVE = "powerhouse/document-drive";
const PUBLISHER = "0xpublisher";
const CONN = "conn-reactor";
const CONN_READ = "conn-reactor-read";

const caller = (address: string) =>
  ({ headers: {}, db: {}, user: { address } }) as never;

// The piece ships built, so this runs the module a reactor would load.
const require = createRequire(import.meta.url);
function builtWorkflowRoot(): string | undefined {
  let root: string;
  try {
    root = dirname(require.resolve("@powerhousedao/workflow/package.json"));
  } catch {
    return undefined;
  }
  return existsSync(
    join(root, "dist", "node", "pieces", "reactor", "index.mjs"),
  )
    ? root
    : undefined;
}
const workflowRoot = builtWorkflowRoot();

// What the host's package manager reports: the package's own list, with every
// declared entry resolved against the package root.
async function builtPieces(root: string): Promise<LocalPiece[]> {
  const listPath = join(root, "dist", "node", "pieces", "index.mjs");
  const list = (await import(pathToFileURL(listPath).href)) as {
    pieces: PackagePiece[];
  };
  const { version } = JSON.parse(
    readFileSync(join(root, "package.json"), "utf8"),
  ) as { version: string };
  return list.pieces.map((piece) => {
    const where = piece.entry ?? piece.bundle ?? "";
    const path = isAbsolute(where) ? where : join(root, where);
    return {
      name: piece.name,
      version,
      ...(piece.entry ? { entryPath: path } : { bundleDir: path }),
    };
  });
}

function packageRoot(name: string): string {
  let dir = dirname(fileURLToPath(import.meta.resolve(name)));
  while (!existsSync(join(dir, "package.json"))) dir = dirname(dir);
  return dir;
}

// The built modules the worker imports: dist, not the source vitest resolves.
function modelManifest(): ModelManifestEntry[] {
  return [
    {
      documentType: CONNECTION,
      version: "1",
      spec: {
        module: {
          filePath: join(
            packageRoot("@powerhousedao/workflow"),
            "dist/node/document-models/connection/index.mjs",
          ),
          exportName: "Connection",
        },
      },
    },
    {
      documentType: DRIVE,
      version: "1",
      spec: {
        module: {
          filePath: join(
            packageRoot("@powerhousedao/shared"),
            "dist/document-drive/index.js",
          ),
          exportName: "driveDocumentModelModule",
        },
      },
    },
  ];
}

let module: InProcessReactorClientModule;
let publisher: IReactorClient;
let service: WorkflowRuntimeService;
let pieceVersion = "";

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

async function connection(name: string, connectorId = "@acme/x#x") {
  const id = await createDocument(Connection as never);
  await publisher.execute(id, "main", [
    connectionActions.setConnectionName({ name }),
    connectionActions.setConnector({ connectorId, authType: "NONE" }),
  ]);
  return id;
}

let workflows = 0;

// A manual workflow holding one piece-reactor step, run as a single-step test.
async function testStep(
  actionName: string,
  config: Record<string, unknown>,
  reactorConnectionId = CONN,
): Promise<StepTestResult> {
  const id = `wf-piece-${++workflows}`;
  await createDocument(Workflow as never, id);
  await publisher.execute(id, "main", [
    workflowActions.setWorkflowName({ name: id }),
    workflowActions.setTrigger({
      id: "t1",
      pieceName: CORE_PIECE_NAME,
      pieceVersion: CORE_PIECE_VERSION,
      triggerName: "manual",
      config: {},
    }),
    workflowActions.addStep({
      id: "s1",
      key: "step",
      name: actionName,
      pieceName: REACTOR_PIECE,
      pieceVersion,
      actionName,
      config,
      reactorConnectionId,
    }),
    workflowActions.addEdge({ id: "e1", from: "t1", to: "s1", port: "next" }),
  ]);
  return service.testStep(id, "s1", caller(PUBLISHER));
}

async function succeeded<T>(
  actionName: string,
  config: Record<string, unknown>,
): Promise<T> {
  const result = await testStep(actionName, config);
  expect(result.error).toBeUndefined();
  expect(result.status).toBe("SUCCEEDED");
  return result.output as T;
}

type DocumentOutput = {
  header: PHDocument["header"];
  state: Record<string, Record<string, unknown>>;
  extractedFrom?: Record<string, string>;
};

// What document-create and document-dispatch output.
type ReferenceOutput = {
  documentId: string;
  documentType: string;
  branch: string;
  revision: Record<string, number>;
  extractedFrom?: Record<string, string>;
};

const stored = (reference: ReferenceOutput) =>
  publisher.get<ConnectionDocument>(reference.documentId);

describe.skipIf(!workflowRoot)("the reactor piece", () => {
  beforeAll(async () => {
    const pieces = await builtPieces(workflowRoot!);
    pieceVersion = pieces.find(
      (piece) => piece.name === REACTOR_PIECE,
    )!.version;
    packagePieces.setPieces(pieces);

    module = await new ReactorClientBuilder()
      .withReactorBuilder(
        new ReactorBuilder().withDocumentModelSources([
          Workflow as unknown as DocumentModelModule,
          Connection as unknown as DocumentModelModule,
          driveDocumentModelModule as unknown as DocumentModelModule,
        ]),
      )
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

    await createDocument(Connection as never, CONN);
    await publisher.execute(CONN, "main", [
      connectionActions.setConnector({
        connectorId: REACTOR_CONNECTOR_ID,
        authType: "REACTOR",
      }),
      connectionActions.setConfig({ config: { endpoint: "local" } }),
    ]);
    await createDocument(Connection as never, CONN_READ);
    await publisher.execute(CONN_READ, "main", [
      connectionActions.setConnector({
        connectorId: REACTOR_CONNECTOR_ID,
        authType: "REACTOR",
      }),
      connectionActions.setConfig({
        config: { endpoint: "local", access: "read" },
      }),
    ]);

    service = testRuntime({
      reactorClient: publisher,
      subjectOf: (ctx) => ({
        address: (ctx as { user?: { address?: string } }).user?.address,
      }),
      authEnforcement: false,
      modelManifest,
    });
  }, 60_000);

  afterAll(() => {
    service.shutdown();
    packagePieces.reset();
    module.reactor.kill();
  });

  it("lists the document types the worker can load", async () => {
    const output = await succeeded<{
      count: number;
      types: { documentType: string }[];
    }>("document-types", {});

    expect(output.types.map((type) => type.documentType)).toEqual([
      CONNECTION,
      DRIVE,
    ]);
    expect(output.count).toBe(2);
  }, 60_000);

  it("creates into a drive folder and applies its actions", async () => {
    const drive = await publisher.drives.create({ global: { name: "Filing" } });
    const folder = await publisher.drives.addFolder(drive.header.id, "Box");

    const output = await succeeded<ReferenceOutput>("document-create", {
      documentType: CONNECTION,
      name: "Invoice",
      parentId: drive.header.id,
      folderId: JSON.stringify({
        driveId: drive.header.id,
        folderId: folder.id,
      }),
      actions: JSON.stringify([
        {
          type: "SET_CONNECTOR",
          input: { connectorId: "@acme/created#x", authType: "NONE" },
        },
      ]),
    });

    const created = await stored(output);
    expect(output).toEqual({
      documentId: created.header.id,
      documentType: CONNECTION,
      branch: "main",
      revision: created.header.revision,
    });
    expect(created.header.name).toBe("Invoice");
    expect(created.state.global.connectorId).toBe("@acme/created#x");
    const node = await publisher.drives.getNode(
      drive.header.id,
      output.documentId,
    );
    expect(node).toMatchObject({ name: "Invoice", parentFolder: folder.id });
  }, 60_000);

  it("creates under a document parent that is not a drive", async () => {
    const parent = await connection("Parent");

    const output = await succeeded<ReferenceOutput>("document-create", {
      documentType: CONNECTION,
      name: "Child",
      parentId: parent,
    });

    const children = await publisher.find({ parentId: parent });
    expect(children.results.map((child) => child.header.id)).toEqual([
      output.documentId,
    ]);
    expect((await stored(output)).header.name).toBe("Child");
  }, 60_000);

  it("takes the document type and name from a model's JSON payload", async () => {
    const payload =
      '```json\n{"documentType":"powerhouse/connection","name":"From model"}\n```';

    const output = await succeeded<ReferenceOutput>("document-create", {
      parse: "extract",
      payload,
    });

    expect(output.documentType).toBe(CONNECTION);
    expect(output.extractedFrom).toEqual({ payload });
    expect((await stored(output)).header.name).toBe("From model");
  }, 60_000);

  it("refuses an action the step did not allow, leaving the document alone", async () => {
    const target = await connection("Guarded");

    const result = await testStep("document-dispatch", {
      documentId: target,
      actions: [{ type: "SET_CONNECTION_NAME", input: { name: "No" } }],
      allowedActions: "SET_ACCOUNT_LABEL",
    });

    expect(result.status).toBe("FAILED");
    expect(result.error).toMatch(/not allowed here: SET_CONNECTION_NAME/);
    const stored = await publisher.get<ConnectionDocument>(target);
    expect(stored.state.global.name).toBe("Guarded");
  }, 60_000);

  it("journals a write over a read-only connection as a denial", async () => {
    const target = await connection("Locked");

    const result = await testStep(
      "document-dispatch",
      {
        documentId: target,
        actions: [{ type: "SET_CONNECTION_NAME", input: { name: "No" } }],
      },
      CONN_READ,
    );

    expect(result).toMatchObject({
      status: "FAILED",
      errorName: ReactorAccessDeniedError,
    });
    const run = await service.run(result.runId!, caller(PUBLISHER));
    expect(run?.row.error_name).toBe(ReactorAccessDeniedError);
    expect(run?.steps.map((step) => step.error_name)).toEqual([
      ReactorAccessDeniedError,
    ]);
    const stored = await publisher.get<ConnectionDocument>(target);
    expect(stored.state.global.name).toBe("Locked");
  }, 60_000);

  it("journals no error name for a step that succeeds", async () => {
    const result = await testStep("document-types", {});
    const run = await service.run(result.runId!, caller(PUBLISHER));
    expect(run?.row.error_name).toBeNull();
    expect(run?.steps[0]?.error_name).toBeNull();
  }, 60_000);

  it("refuses a document id inside prose by default", async () => {
    const target = await connection("Prose");

    const result = await testStep("document-dispatch", {
      documentId: `The document is "${target}" — dispatch there.`,
      actions: [{ type: "SET_CONNECTION_NAME", input: { name: "x" } }],
    });

    expect(result.status).toBe("FAILED");
    expect(result.error).toMatch(/not a document id/);
  }, 60_000);

  it("digs a document id out of prose when asked to extract", async () => {
    const target = await connection("Before");
    const documentId = `The document is "${target}" — dispatch there.`;

    const output = await succeeded<ReferenceOutput>("document-dispatch", {
      parse: "extract",
      documentId,
      actions: [{ type: "SET_CONNECTION_NAME", input: { name: "After" } }],
    });

    expect(output.documentId).toBe(target);
    expect((await stored(output)).state.global.name).toBe("After");
    expect(output.extractedFrom).toEqual({ documentId });
  }, 60_000);

  describe("document-find", () => {
    let march = "";
    let receipt = "";

    beforeAll(async () => {
      march = await connection("Invoice March", "@acme/order#order-a");
      receipt = await connection("Receipt", "@acme/order#order-b");
    });

    type Found = {
      results: { header: PHDocument["header"]; state?: unknown }[];
      nextCursor?: string;
    };

    it("filters by name in the piece, returning headers only", async () => {
      const output = await succeeded<Found>("document-find", {
        documentType: CONNECTION,
        name: "invoice march",
      });

      expect(output.results.map((found) => found.header.id)).toEqual([march]);
      expect(Object.keys(output.results[0] ?? {})).toEqual(["header"]);
      expect(output.nextCursor).toBeUndefined();
    }, 60_000);

    it("matches a state field, and records results with state as references", async () => {
      const output = await succeeded<{
        results: { $documentRef: { documentId: string } }[];
      }>("document-find", {
        documentType: CONNECTION,
        matchPath: "connectorId",
        matchValue: "@acme/order#order-b",
        includeState: true,
      });

      expect(output.results.map((found) => found.$documentRef)).toEqual([
        expect.objectContaining({ documentId: receipt }),
      ]);
    }, 60_000);

    it("refuses a half-written state match instead of returning everything", async () => {
      const result = await testStep("document-find", {
        documentType: CONNECTION,
        matchPath: "connectorId",
      });

      expect(result.status).toBe("FAILED");
      expect(result.error).toMatch(/set together or not at all/);
    }, 60_000);
  });

  describe("the run journal", () => {
    const expression = (...props: string[]) =>
      props.map((prop) => ({ prop, mode: "EXPRESSION" as const }));

    const journaledOutputs = async (runId: string) => {
      const run = await service.run(runId, caller(PUBLISHER));
      return Object.fromEntries(
        (run?.steps ?? []).map((step) => [
          step.step_key,
          step.output === null ? null : (JSON.parse(step.output) as unknown),
        ]),
      );
    };

    const reference = (document: PHDocument) => ({
      documentId: document.header.id,
      documentType: document.header.documentType,
      branch: "main",
      revision: document.header.revision,
    });

    it("journals a read's document as a reference, the step's own keys beside it", async () => {
      // Created by a run, so it carries grants: an auth revision to keep.
      const target = (
        await succeeded<ReferenceOutput>("document-create", {
          documentType: CONNECTION,
          name: "Journaled",
        })
      ).documentId;
      const documentId = `The document is "${target}".`;

      const result = await testStep("document-get", {
        documentId,
        parse: "extract",
      });

      const document = await publisher.get(target);
      expect(document.header.revision.auth).toBeGreaterThan(0);
      const marker = {
        $documentRef: reference(document),
        extractedFrom: { documentId },
      };
      expect(result.output).toEqual(marker);
      expect((await journaledOutputs(result.runId!)).step).toEqual(marker);
    }, 60_000);

    it("journals each document a find returns with state as a reference", async () => {
      const target = await connection("Found by state", "@acme/journal#find");

      const result = await testStep("document-find", {
        documentType: CONNECTION,
        matchPath: "connectorId",
        matchValue: "@acme/journal#find",
        includeState: true,
      });

      const journaled = (await journaledOutputs(result.runId!)).step;
      expect(journaled).toEqual({
        results: [{ $documentRef: reference(await publisher.get(target)) }],
      });
    }, 60_000);

    it("journals a write's reference as it is", async () => {
      const target = await connection("Written");

      const result = await testStep("document-dispatch", {
        documentId: target,
        actions: [{ type: "SET_CONNECTION_NAME", input: { name: "Wrote" } }],
      });

      expect((await journaledOutputs(result.runId!)).step).toEqual(
        reference(await publisher.get(target)),
      );
    }, 60_000);

    // manual → dispatch → get → check, published and enabled.
    async function pipeline(target: string): Promise<string> {
      const id = `wf-journal-${++workflows}`;
      await createDocument(Workflow as never, id);
      await publisher.execute(id, "main", [
        workflowActions.setWorkflowName({ name: id }),
        workflowActions.setTrigger({
          id: "t1",
          pieceName: CORE_PIECE_NAME,
          pieceVersion: CORE_PIECE_VERSION,
          triggerName: "manual",
          config: {},
        }),
        workflowActions.addStep({
          id: "s1",
          key: "dispatch",
          name: "Dispatch",
          pieceName: REACTOR_PIECE,
          pieceVersion,
          actionName: "document-dispatch",
          config: {
            documentId: target,
            actions: [{ type: "SET_CONNECTION_NAME", input: { name: "Sent" } }],
          },
          reactorConnectionId: CONN,
        }),
        workflowActions.addStep({
          id: "s2",
          key: "get",
          name: "Get",
          pieceName: REACTOR_PIECE,
          pieceVersion,
          actionName: "document-get",
          config: { documentId: "{{steps.dispatch.output.documentId}}" },
          propertySettings: expression("documentId"),
          reactorConnectionId: CONN,
        }),
        workflowActions.addStep({
          id: "s3",
          key: "check",
          name: "Check",
          pieceName: CORE_PIECE_NAME,
          pieceVersion: CORE_PIECE_VERSION,
          actionName: "assert",
          config: {
            value: "{{steps.get.output.state.global.name}}",
            allowValues: ["Approved"],
          },
          propertySettings: expression("value"),
        }),
        workflowActions.addEdge({
          id: "e1",
          from: "t1",
          to: "s1",
          port: "next",
        }),
        workflowActions.addEdge({
          id: "e2",
          from: "s1",
          to: "s2",
          port: "next",
        }),
        workflowActions.addEdge({
          id: "e3",
          from: "s2",
          to: "s3",
          port: "next",
        }),
        workflowActions.publishWorkflow({
          publishedAt: "2026-10-06T00:00:00.000Z",
        }),
        workflowActions.setWorkflowStatus({ status: "ENABLED" }),
      ]);
      return id;
    }

    it("a rerun after a later step fails re-reads the document and does not repeat the write", async () => {
      const target = await connection("Draft");
      const workflowId = await pipeline(target);

      const failed = await service.fire(
        workflowId,
        undefined,
        "manual",
        undefined,
        caller(PUBLISHER),
      );
      expect(failed.status).toBe("FAILED");
      expect(failed.steps.at(-1)?.error).toMatch(/"Sent" is not one of/);
      const afterRun = await publisher.get<ConnectionDocument>(target);
      expect(afterRun.state.global.name).toBe("Sent");

      // Someone approves the document between the run and its rerun.
      await publisher.execute(target, "main", [
        connectionActions.setConnectionName({ name: "Approved" }),
      ]);
      const approved = await publisher.get<ConnectionDocument>(target);

      const rerun = await service.rerun(failed.runId!, caller(PUBLISHER));

      expect(rerun.status).toBe("SUCCEEDED");
      expect(rerun.steps.map((step) => [step.key, step.status])).toEqual([
        ["dispatch", "REPLAYED"],
        ["get", "SUCCEEDED"],
        ["check", "SUCCEEDED"],
      ]);
      // The write is not sent again: the document is as it was approved.
      const final = await publisher.get<ConnectionDocument>(target);
      expect(final.state.global.name).toBe("Approved");
      expect(final.header.revision).toEqual(approved.header.revision);
      expect(rerun.steps[0].output).toEqual(reference(afterRun));
      expect(rerun.steps[2].output).toEqual({ value: "Approved" });
    }, 60_000);

    it("tests a step reading a document's state against the document as it is now", async () => {
      const target = await connection("Before");
      const workflowId = await pipeline(target);

      expect(
        (await service.testStep(workflowId, "s2", caller(PUBLISHER))).status,
      ).toBe("FAILED");
      // The get step reads an id from the dispatch step: test that first.
      await service.testStep(workflowId, "s1", caller(PUBLISHER));
      const get = await service.testStep(workflowId, "s2", caller(PUBLISHER));
      expect(get.status).toBe("SUCCEEDED");
      await publisher.execute(target, "main", [
        connectionActions.setConnectionName({ name: "Approved" }),
      ]);

      const check = await service.testStep(workflowId, "s3", caller(PUBLISHER));

      expect(check.error).toBeUndefined();
      expect(check.output).toEqual({ value: "Approved" });
    }, 60_000);

    it("offers a tested read's state fields from the model, not the journal", async () => {
      const target = await connection("Picked", "@acme/picked#x");
      const workflowId = await pipeline(target);
      await service.testStep(workflowId, "s1", caller(PUBLISHER));
      await service.testStep(workflowId, "s2", caller(PUBLISHER));

      const tree = await service.stepOutputTree(
        workflowId,
        "s2",
        caller(PUBLISHER),
      );

      expect(tree.source).toBe("test");
      const sample = tree.sample as DocumentOutput;
      expect(sample.header).toMatchObject({
        id: target,
        documentType: CONNECTION,
        branch: "main",
      });
      expect(Object.keys(sample.state)).toEqual(["global"]);
      expect(sample.state.global.connectorId).not.toBe("@acme/picked#x");
      const state = tree.nodes.find((node) => node.name === "state");
      const global = state?.children?.find((node) => node.name === "global");
      expect(global?.children?.map((node) => node.name)).toEqual(
        expect.arrayContaining(["name", "connectorId"]),
      );
    }, 60_000);
  });

  it("reads a schema narrowed to one action, with its scope", async () => {
    const output = await succeeded<{
      documentType: string;
      actions: { type: string; scope: string; inputSchema: string | null }[];
    }>("document-schema", {
      documentType: CONNECTION,
      actionType: "SET_CONNECTION_NAME",
    });

    expect(output.documentType).toBe(CONNECTION);
    expect(output.actions).toHaveLength(1);
    expect(output.actions[0]).toMatchObject({
      type: "SET_CONNECTION_NAME",
      scope: "global",
    });
    expect(output.actions[0]?.inputSchema).toContain("name");
  }, 60_000);

  it("resolves the schema's type from a document id", async () => {
    const drive: DocumentDriveDocument = await publisher.drives.create({
      global: { name: "Typed" },
    });

    const output = await succeeded<{ documentType: string }>(
      "document-schema",
      { documentId: drive.header.id },
    );

    expect(output.documentType).toBe(DRIVE);
  }, 60_000);
});
