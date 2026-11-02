// ctx.reactor's write half under the reactor's auth enforcement: a real forked
// piece worker, a real in-process reactor enforcing a document's policy.
import { ReactorAccessDeniedError } from "@powerhousedao/pieces-framework";
import {
  ReactorBuilder,
  ReactorClientBuilder,
  type InProcessReactorClientModule,
} from "@powerhousedao/reactor";
import {
  driveDocumentModelModule,
  type DocumentDriveDocument,
} from "@powerhousedao/shared/document-drive";
import {
  initializeAuth,
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
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  CORE_PIECE_NAME,
  CORE_PIECE_VERSION,
} from "../../../src/pieces/index.js";
import { packagePieces } from "../../../src/reactor/piece-registry.js";
import type { WorkflowRuntimeService } from "../../../src/reactor/service.js";
import { testRuntime } from "../../helpers/runtime.js";

const PIECE = "@acme/piece-enforced-batch";
const VERSION = "1.0.0";
const RUNNER = "0xrunner";
const CONNECTION = "conn-enforced";
const WORKFLOW = "wf-enforced";

// The built entries, importable by path from the piece's own module.
function builtEntry(name: string, ...path: string[]): string {
  let dir = dirname(fileURLToPath(import.meta.resolve(name)));
  while (!existsSync(join(dir, "package.json"))) dir = dirname(dir);
  return pathToFileURL(join(dir, "dist", ...path)).href;
}

const FIXTURE = `
import { addFolder, deleteNode } from ${JSON.stringify(builtEntry("@powerhousedao/shared/document-drive", "document-drive", "index.js"))};
import { deniedActionIndexes } from ${JSON.stringify(builtEntry("@powerhousedao/pieces-framework", "index.js"))};

export const batch = {
  displayName: "Batch",
  actions: {
    batch: {
      name: "batch",
      displayName: "Batch",
      requireReactor: "write",
      props: { id: { displayName: "Id", type: "SHORT_TEXT", required: false } },
      run: async (ctx) => {
        try {
          await ctx.reactor.write.execute(ctx.propsValue.id, "main", [
            addFolder({ id: "a", name: "a" }),
            deleteNode({ id: "a" }),
            addFolder({ id: "b", name: "b" }),
          ]);
          return { written: true };
        } catch (error) {
          return {
            name: error.name,
            message: error.message,
            indexes: deniedActionIndexes(error),
          };
        }
      },
    },
  },
  triggers: {},
};
`;

let dir = "";
let module: InProcessReactorClientModule;
let service: WorkflowRuntimeService;

async function create(model: DocumentModelModule, id: string) {
  await module.client.create(
    withSignaturePolicy(model.utils.createDocument(), "legacy", { id }),
  );
}

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "ph-reactor-rpc-enforced-"));
  const entryPath = join(dir, "index.mjs");
  await writeFile(entryPath, FIXTURE);
  packagePieces.setPieces([{ name: PIECE, version: VERSION, entryPath }]);

  module = await new ReactorClientBuilder()
    .withReactorBuilder(
      new ReactorBuilder()
        .withDocumentModelSources([
          Workflow as unknown as DocumentModelModule,
          Connection as unknown as DocumentModelModule,
          driveDocumentModelModule as unknown as DocumentModelModule,
        ])
        .withExecutorConfig({
          featureFlags: { documentDecisions: true, authEnforcement: true },
        }),
    )
    .buildModule();

  await create(Connection as never, CONNECTION);
  await module.client.execute(CONNECTION, "main", [
    connectionActions.setConnector({
      connectorId: REACTOR_CONNECTOR_ID,
      authType: "REACTOR",
    }),
    connectionActions.setConfig({ config: { endpoint: "local" } }),
  ]);
  await create(Workflow as never, WORKFLOW);
  await module.client.execute(WORKFLOW, "main", [
    workflowActions.setWorkflowName({ name: WORKFLOW }),
    workflowActions.setTrigger({
      id: "t1",
      pieceName: CORE_PIECE_NAME,
      pieceVersion: CORE_PIECE_VERSION,
      triggerName: "manual",
      config: {},
    }),
  ]);

  service = testRuntime({
    reactorClient: module.client,
    subjectOf: (ctx) => ({
      address: (ctx as { user?: { address?: string } }).user?.address,
    }),
    authEnforcement: true,
  });
}, 60_000);

afterAll(async () => {
  service.shutdown();
  packagePieces.reset();
  module.reactor.kill();
  await rm(dir, { recursive: true, force: true });
});

describe("ctx.reactor.write under auth enforcement", () => {
  it("refuses a batch with an action the run user may not apply, naming its index", async () => {
    await create(driveDocumentModelModule as never, "drive-enforced");
    // The runner may add folders and read; deleting a node is not granted.
    await module.client.execute("drive-enforced", "main", [
      initializeAuth({
        version: 1,
        grants: [
          {
            id: "g-add",
            description: "the runner adds folders",
            effect: "allow",
            principal: { address: RUNNER },
            capability: {
              can: "execute",
              scope: "global",
              operation: ["ADD_FOLDER"],
            },
          },
          {
            id: "g-read",
            description: "the runner reads",
            effect: "allow",
            principal: { address: RUNNER },
            capability: { can: "read", scope: "global" },
          },
          {
            id: "g-admin",
            description: "administration stays reachable",
            effect: "allow",
            principal: { anyone: true },
            capability: { can: "execute", scope: "auth" },
          },
        ],
      }),
    ]);
    const read = () =>
      module.client.get<DocumentDriveDocument>("drive-enforced", {
        subject: { address: RUNNER },
      });
    const before = await read();
    await module.client.execute(WORKFLOW, "main", [
      workflowActions.addStep({
        id: "s1",
        key: "batch-1",
        name: "batch",
        pieceName: PIECE,
        pieceVersion: VERSION,
        actionName: "batch",
        config: { id: "drive-enforced" },
        reactorConnectionId: CONNECTION,
      }),
    ]);

    const result = await service.testStep(WORKFLOW, "s1", {
      headers: {},
      db: {},
      user: { address: RUNNER },
    } as never);

    expect(result.status).toBe("SUCCEEDED");
    expect(result.output).toEqual({
      name: ReactorAccessDeniedError,
      message: expect.stringMatching(
        /^The run user may not apply DELETE_NODE \(.+\) to document drive-enforced; denied action indexes: \[1\]$/,
      ) as unknown,
      indexes: [1],
    });
    const after = await read();
    expect(after.state.global.nodes).toEqual([]);
    expect(after.header.revision).toEqual(before.header.revision);
  }, 60_000);
});
