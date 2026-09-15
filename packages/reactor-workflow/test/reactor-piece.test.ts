// The reactor piece end to end: the registry finds the built bundle, the
// worker runs the piece in a child process, and its reactor calls come back
// to a port standing in for the host's reactor client.
import {
  ActivepiecesBlockExecutor,
  localFirstResolver,
  type PieceResolver,
  type ReactorPort,
} from "@powerhousedao/reactor-connectors";
import type { BlockExecution } from "@powerhousedao/reactor-connectors";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PieceRegistry } from "../../subgraphs/workflow-runtime/piece-registry.js";

const PIECE = "@powerhousedao/piece-reactor";
const packageRoot = fileURLToPath(new URL("../..", import.meta.url));

// Every call the piece made, and what the port answered with.
function stubPort(): ReactorPort & { calls: string[] } {
  const calls: string[] = [];
  const summary = (documentId: string, name = "Invoice") => ({
    documentId,
    documentType: "powerhouse/workflow",
    name,
    slug: "invoice",
    state: { name },
  });
  return {
    calls,
    models() {
      calls.push("models");
      return Promise.resolve([
        { documentType: "powerhouse/workflow", name: "Workflow" },
        { documentType: "powerhouse/connection", name: "Connection" },
      ]);
    },
    model(documentType) {
      calls.push(`model ${documentType}`);
      return Promise.resolve({
        documentType,
        name: "Workflow",
        stateSchema: "type WorkflowState { name: String }",
        actions: [
          { type: "SET_NAME", module: "base", inputSchema: null },
          { type: "ADD_STEP", module: "steps", inputSchema: "input AddStepInput { key: String! }" },
        ],
      });
    },
    get(input) {
      calls.push(`get ${input.documentId}`);
      return Promise.resolve(summary(input.documentId));
    },
    find(input) {
      calls.push(`find ${JSON.stringify(input)}`);
      return Promise.resolve([
        summary("doc-1", "Invoice March"),
        summary("doc-2", "Receipt"),
      ]);
    },
    create(input) {
      calls.push(
        `create ${input.documentType} parent=${input.parentId ?? "-"} name=${input.name ?? "-"}`,
      );
      return Promise.resolve(summary("new-1", input.name ?? ""));
    },
    execute(input) {
      calls.push(
        `execute ${input.documentId} ${input.actions.map((a) => a.type).join(",")}`,
      );
      return Promise.resolve(summary(input.documentId, "Renamed"));
    },
  };
}

function execution(block: string, config: unknown): BlockExecution {
  const blockType = `${PIECE}#${block}`;
  return {
    blockType,
    config,
    step: { id: "s1", key: "step", blockType } as BlockExecution["step"],
  };
}

let registry: PieceRegistry;
let resolver: PieceResolver;
let executor: ActivepiecesBlockExecutor;
let port: ReturnType<typeof stubPort>;

describe("the reactor piece", () => {
  beforeAll(async () => {
    // The bundle is a build artifact; build it the way the piece packages'
    // own suites do rather than depending on a previous run.
    execFileSync("node", ["scripts/bundle-pieces.mjs"], { cwd: packageRoot });
    registry = new PieceRegistry();
    await registry.load(packageRoot);
    resolver = localFirstResolver(registry.lookup, {
      resolve: () => Promise.reject(new Error("nothing is fetched in this test")),
    });
  }, 60_000);

  beforeEach(() => {
    port = stubPort();
    executor = new ActivepiecesBlockExecutor({
      cacheDir: packageRoot,
      resolver,
      // The block types below carry no version, exactly as the editor writes
      // them; the installed one comes from the registry.
      packages: () => registry.versions(),
      reactor: port,
    });
  });

  afterAll(() => {
    executor.dispose();
  });

  it("lists the document types the reactor holds", async () => {
    const result = await executor.execute(execution("document-types", {}));

    expect(result.output).toEqual({
      count: 2,
      types: [
        { documentType: "powerhouse/workflow", name: "Workflow" },
        { documentType: "powerhouse/connection", name: "Connection" },
      ],
    });
  });

  it("creates a document and applies its initial actions", async () => {
    const result = await executor.execute(
      execution("document-create", {
        documentType: "powerhouse/workflow",
        name: "Invoice",
        parentId: "drive-1",
        actions: [{ type: "ADD_STEP", input: { key: "fetch" } }],
      }),
    );

    expect(port.calls).toEqual([
      // The name travels with the create — the port is what names a document,
      // whichever path it took — so only the author's actions are dispatched.
      "create powerhouse/workflow parent=drive-1 name=Invoice",
      "execute new-1 ADD_STEP",
    ]);
    expect(result.output).toEqual({
      documentId: "new-1",
      documentType: "powerhouse/workflow",
      name: "Renamed",
      state: { name: "Renamed" },
    });
  });

  it("takes the document type and actions from a model's JSON payload", async () => {
    await executor.execute(
      execution("document-create", {
        payload:
          '```json\n{"documentType":"powerhouse/connection","name":"From model","actions":[{"type":"SET_NAME","input":{"name":"x"}}]}\n```',
      }),
    );

    expect(port.calls[0]).toBe(
      "create powerhouse/connection parent=- name=From model",
    );
  });

  it("refuses an action the step did not allow", async () => {
    await expect(
      executor.execute(
        execution("document-dispatch", {
          documentId: "doc-1",
          actions: [{ type: "DELETE_DOCUMENT" }],
          allowedActions: "SET_NAME, ADD_STEP",
        }),
      ),
    ).rejects.toThrow(/not allowed here: DELETE_DOCUMENT/);
    expect(port.calls).toEqual([]);
  });

  it("digs a document id out of prose an AI step produced", async () => {
    await executor.execute(
      execution("document-dispatch", {
        documentId:
          'The document is "01234567-89ab-cdef-0123-456789abcdef" — dispatch there.',
        actions: [{ type: "SET_NAME", input: { name: "x" } }],
      }),
    );

    expect(port.calls).toEqual([
      "execute 01234567-89ab-cdef-0123-456789abcdef SET_NAME",
    ]);
  });

  it("filters found documents by name and caps the list", async () => {
    const result = await executor.execute(
      execution("document-find", {
        documentType: "powerhouse/workflow",
        name: "invoice",
      }),
    );

    expect(port.calls).toEqual(['find {"documentType":"powerhouse/workflow"}']);
    expect(result.output).toEqual({
      count: 1,
      documents: [expect.objectContaining({ documentId: "doc-1" })],
    });
  });

  it("hands the host a state match, which is how a step binds to a document", async () => {
    // The index cannot query state; this is the only way a workflow finds the
    // document that carries a given order id, invoice number or external key.
    const result = await executor.execute(
      execution("document-find", {
        documentType: "powerhouse/workflow",
        matchPath: "orderId",
        matchValue: "order-a",
        includeState: true,
      }),
    );

    expect(port.calls).toEqual([
      'find {"documentType":"powerhouse/workflow","match":{"path":"orderId","value":"order-a"},"withState":true}',
    ]);
    expect(result.output).toMatchObject({ count: 2 });
  });

  it("refuses a half-written state match instead of returning everything", async () => {
    // A field with no value would otherwise read as "no filter", handing a step
    // that asked for one document every document of the type.
    await expect(
      executor.execute(
        execution("document-find", {
          documentType: "powerhouse/workflow",
          matchPath: "orderId",
        }),
      ),
    ).rejects.toThrow(/set together or not at all/);
    expect(port.calls).toEqual([]);
  });

  it("reads a schema, narrowed to one action when asked", async () => {
    const result = await executor.execute(
      execution("document-schema", {
        documentType: "powerhouse/workflow",
        actionType: "ADD_STEP",
      }),
    );

    expect(result.output).toEqual({
      documentType: "powerhouse/workflow",
      name: "Workflow",
      stateSchema: "type WorkflowState { name: String }",
      actions: [
        {
          type: "ADD_STEP",
          module: "steps",
          inputSchema: "input AddStepInput { key: String! }",
        },
      ],
    });
  });

  it("resolves the type from a document id when none was given", async () => {
    await executor.execute(execution("document-schema", { documentId: "doc-9" }));

    expect(port.calls).toEqual(["get doc-9", "model powerhouse/workflow"]);
  });
});
