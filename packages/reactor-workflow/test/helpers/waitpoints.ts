// Shared by the suspend and resume suites: a fixture piece, workflow builders,
// webhook arming and journal reads over a real runtime.
import type {
  IRelationalDb,
  WebhookRequest,
} from "@powerhousedao/shared/processors";
import { actions } from "@powerhousedao/workflow/document-models/workflow";
import type { Operation, OperationWithContext } from "document-model";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Kysely } from "kysely";
import { afterAll, beforeAll, expect } from "vitest";
import { CORE_PIECE_NAME, CORE_PIECE_VERSION } from "../../src/pieces/index.js";
import { packagePieces } from "../../src/reactor/piece-registry.js";
import type { WorkflowRuntimeService } from "../../src/reactor/service.js";
import type {
  StepExecutionRow,
  WaitpointRow,
  WorkflowRuntimeDB,
} from "../../src/reactor/store.js";
import { Documents } from "./documents.js";
import { createFreshRelationalDb } from "./pglite.js";
import { testRuntime } from "./runtime.js";

export const CTX = { headers: {}, db: {}, user: { address: "0xabc" } } as never;
export const BASE_URL = "https://switchboard.test/waitpoints";
export const PIECE = "@acme/piece-waits";
export const PIECE_VERSION = "1.0.0";

// gate waits (responseToSend on `status`, a respond on resume on `tag`); link
// mints a URL without waiting; hold runs until its `flag` file exists.
const SHARED_ACTIONS = `
    gate: {
      name: "gate",
      displayName: "Gate",
      props: { status, tag },
      run: async (ctx) => {
        if (ctx.executionType === "BEGIN") {
          const waitpoint = await ctx.run.createWaitpoint({
            type: "WEBHOOK",
            ...(ctx.propsValue.status
              ? { responseToSend: { status: ctx.propsValue.status, body: { waiting: true } } }
              : {}),
          });
          ctx.run.waitForWaitpoint(waitpoint.id);
          return { url: waitpoint.resumeUrl };
        }
        const action = ctx.resumePayload.queryParams?.action ?? null;
        if (ctx.propsValue.tag) {
          ctx.run.respond({ response: { body: { tag: ctx.propsValue.tag, action } } });
        }
        return { action, approved: action === "approve", body: ctx.resumePayload.body ?? null };
      },
    },
    echo: {
      name: "echo",
      displayName: "Echo",
      props: { text: { displayName: "Text", type: "SHORT_TEXT", required: false } },
      run: async (ctx) => ({ text: ctx.propsValue.text ?? null, at: Math.random() }),
    },
    link: {
      name: "link",
      displayName: "Link",
      props: {},
      run: async (ctx) => {
        const waitpoint = await ctx.run.createWaitpoint({ type: "WEBHOOK" });
        return {
          url: waitpoint.resumeUrl,
          approve: waitpoint.buildResumeUrl({ queryParams: { action: "approve" } }),
          canPause: ctx.run.canPause,
        };
      },
    },
    hold: {
      name: "hold",
      displayName: "Hold",
      props: { flag: { displayName: "Flag", type: "SHORT_TEXT", required: true } },
      run: async (ctx) => {
        const deadline = Date.now() + 15000;
        while (!existsSync(ctx.propsValue.flag)) {
          if (Date.now() > deadline) throw new Error("hold was never released");
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
        return { held: true };
      },
    },
    twice: {
      name: "twice",
      displayName: "Twice",
      props: {},
      run: async (ctx) => {
        if (ctx.executionType === "BEGIN") {
          const a = await ctx.run.createWaitpoint({ type: "WEBHOOK" });
          const b = await ctx.run.createWaitpoint({ type: "WEBHOOK" });
          ctx.run.waitForWaitpoint(b.id);
          return { a: a.resumeUrl, b: b.resumeUrl };
        }
        return { body: ctx.resumePayload.body ?? null };
      },
    },
    flaky: {
      name: "flaky",
      displayName: "Flaky",
      props: {},
      run: async (ctx) => {
        const waitpoint = await ctx.run.createWaitpoint({ type: "WEBHOOK" });
        throw new Error("flaky " + waitpoint.resumeUrl);
      },
    },
`;

/** The fixture piece's module source: the shared actions plus a suite's own. */
export function fixturePiece(extraActions = ""): string {
  return `
import { existsSync } from "node:fs";
const status = { displayName: "Status", type: "NUMBER", required: false };
const tag = { displayName: "Tag", type: "SHORT_TEXT", required: false };
export const waits = {
  displayName: "Waits",
  actions: {${SHARED_ACTIONS}${extraActions}
  },
  triggers: {},
};
`;
}

/** [key, action, config]; a "core:" action is the core piece's. */
export type StepSpec = [key: string, action: string, config?: object];

export interface WorkflowOptions {
  trigger?: { triggerName: string; config: object };
  policy?: object;
  // [from, to, port]; a chain from the trigger on "next" by default.
  edges?: [from: string, to: string, port: string][];
  // Bare action names resolve here; the fixture piece by default.
  piece?: { name: string; version: string };
  // More addStep fields by step key, e.g. a retry policy.
  stepFields?: Record<string, object>;
}

export const CORE = { name: CORE_PIECE_NAME, version: CORE_PIECE_VERSION };

/** Publishes an ENABLED workflow: trigger → steps. */
export function defineWorkflow(
  documents: Documents,
  id: string,
  steps: StepSpec[],
  options: WorkflowOptions = {},
) {
  const piece = options.piece ?? { name: PIECE, version: PIECE_VERSION };
  const edges =
    options.edges ??
    steps.map(([key], index): [string, string, string] => [
      index === 0 ? "t1" : steps[index - 1]![0],
      key,
      "next",
    ]);
  return documents.apply(
    id,
    ...(options.policy ? [actions.setPolicy(options.policy as never)] : []),
    actions.setTrigger({
      id: "t1",
      pieceName: CORE_PIECE_NAME,
      pieceVersion: CORE_PIECE_VERSION,
      ...(options.trigger ?? { triggerName: "manual", config: {} }),
    } as never),
    ...steps.map(([key, action, config = {}]) => {
      const core = action.startsWith("core:");
      return actions.addStep({
        id: key,
        key,
        name: key,
        pieceName: core ? CORE_PIECE_NAME : piece.name,
        pieceVersion: core ? CORE_PIECE_VERSION : piece.version,
        actionName: core ? action.slice(5) : action,
        config,
        ...options.stepFields?.[key],
      });
    }),
    ...edges.map(([from, to, port], index) =>
      actions.addEdge({ id: `e${index}`, from, to, port }),
    ),
    actions.publishWorkflow({ publishedAt: "2026-01-01T00:00:00.000Z" }),
    actions.setWorkflowStatus({ status: "ENABLED" }),
  );
}

// Module-scoped: a runtime ignores an ordinal at or below the highest it saw.
let ordinal = 0;

/** Publishes a webhook-triggered workflow and arms it, as its operation would. */
export async function armWebhook(
  service: WorkflowRuntimeService,
  documents: Documents,
  id: string,
  mode: "sync" | "async",
  steps: StepSpec[],
  options: Omit<WorkflowOptions, "trigger"> = {},
) {
  const document = defineWorkflow(documents, id, steps, {
    ...options,
    trigger: {
      triggerName: "webhook",
      config: { scheme: "none", responseMode: mode },
    },
  });
  ordinal += 1;
  await service.onOperations([
    {
      operation: {
        ...document.operations.global.at(-1)!,
        resultingState: JSON.stringify(document.state.global),
      },
      context: {
        documentId: id,
        documentType: "powerhouse/workflow",
        scope: "global",
        branch: "main",
        ordinal,
      },
    } as unknown as OperationWithContext,
  ]);
}

export function webhookDelivery(
  key: string,
  request: { body?: unknown; headers?: Record<string, string> } = {},
): WebhookRequest {
  const body = request.body ?? {};
  return {
    key,
    method: "POST",
    path: "/webhooks/0123456789abcdef0123456789abcdef",
    queryParams: {},
    headers: { "content-type": "application/json", ...request.headers },
    raw: Buffer.from(JSON.stringify(body), "utf8"),
    body,
  };
}

export const fire = (
  service: WorkflowRuntimeService,
  id: string,
  payload?: unknown,
) => service.fire(id, payload, "manual", undefined, CTX);

export async function runOf(service: WorkflowRuntimeService, runId: string) {
  return (await (await service.store())!.getRun(runId))!;
}

export async function runStatus(
  service: WorkflowRuntimeService,
  runId: string,
) {
  return (await (await service.store())!.getRun(runId))?.status;
}

// For expect.poll and vi.waitFor: a loaded worker outruns their 1s default.
export const POLL = { timeout: 15_000, interval: 25 };

/** Waits for the run to reach `status`; returns its row. */
export async function settles(
  service: WorkflowRuntimeService,
  runId: string,
  status: string,
) {
  await expect.poll(() => runStatus(service, runId), POLL).toBe(status);
  return runOf(service, runId);
}

/** The run's journaled steps by key. */
export async function stepsOf(service: WorkflowRuntimeService, runId: string) {
  const rows = await (await service.store())!.getSteps(runId);
  return Object.fromEntries(rows.map((row) => [row.step_key, row])) as Partial<
    Record<string, StepExecutionRow>
  >;
}

/** The newest run of a workflow, as a webhook delivery started it. */
export async function latestRun(
  service: WorkflowRuntimeService,
  workflowId: string,
) {
  return (await service.runs({ workflowId }, CTX))[0]!.row.id;
}

export function json<T = Record<string, unknown>>(
  raw: string | null | undefined,
): T {
  return JSON.parse(raw ?? "null") as T;
}

/** The token a resume URL carries. */
export const tokenOf = (url: string) =>
  new URL(url).pathname.split("/").filter(Boolean)[1]!;

/** A PENDING DELAY waitpoint row, for store-level tests. */
export function waitpointRow(
  runId: string,
  overrides: Partial<WaitpointRow> = {},
): WaitpointRow {
  return {
    id: randomUUID(),
    run_id: runId,
    workflow_id: "wf",
    step_id: "s",
    step_key: "s",
    step_path: "s",
    piece_name: CORE_PIECE_NAME,
    block_name: "delay",
    type: "DELAY",
    kind: "delay",
    status: "PENDING",
    token_hash: null,
    created_at: new Date().toISOString(),
    resume_at: null,
    expires_at: null,
    resolved_at: null,
    decided_by: null,
    approval: null,
    resume_payload: null,
    response_to_send: null,
    ...overrides,
  };
}

export interface WaitpointSuiteOptions {
  // The suite's own fixture actions, beside the shared ones.
  actions?: string;
  runtime?: Parameters<typeof testRuntime>[0];
}

// The fixture piece and one runtime over a fresh database for the file;
// `runtime()` adds more over the same documents. All torn down after it.
export function waitpointSuite(options: WaitpointSuiteOptions = {}) {
  const documents = new Documents();
  // Document-scope operations by workflow, served beside the global ones.
  const documentOps = new Map<string, Operation[]>();
  const client = {
    ...documents.client(),
    getOperations: (id: string) =>
      Promise.resolve({
        results: [
          ...(documentOps.get(id) ?? []),
          ...(documents.byId.get(id)?.operations.global ?? []),
        ],
        options: { cursor: "", limit: 0 },
      }),
  };
  const extra: WorkflowRuntimeService[] = [];
  const suite = {
    dir: "",
    documents,
    documentOps,
    client,
    relational: undefined as unknown as IRelationalDb,
    db: undefined as unknown as Kysely<WorkflowRuntimeDB>,
    service: undefined as unknown as WorkflowRuntimeService,
    /** Another runtime, over its own database unless given one. */
    runtime(
      relationalDb: IRelationalDb = createFreshRelationalDb(),
      deps: Parameters<typeof testRuntime>[0] = {},
    ) {
      const service = testRuntime({
        relationalDb,
        reactorClient: client as never,
        waitpointBaseUrl: BASE_URL,
        ...options.runtime,
        ...deps,
      });
      extra.push(service);
      return service;
    },
    /** A hold's flag, and the call that lets it finish. */
    latch(name: string) {
      const flag = join(suite.dir, `${name}.flag`);
      return { flag, release: () => writeFile(flag, "") };
    },
    define(id: string, steps: StepSpec[], workflow: WorkflowOptions = {}) {
      return defineWorkflow(documents, id, steps, workflow);
    },
  };
  beforeAll(async () => {
    suite.dir = await mkdtemp(join(tmpdir(), "rw-waits-"));
    const entryPath = join(suite.dir, "index.mjs");
    await writeFile(entryPath, fixturePiece(options.actions));
    packagePieces.setPieces([
      { name: PIECE, version: PIECE_VERSION, entryPath },
    ]);
    suite.relational = createFreshRelationalDb();
    suite.db =
      await suite.relational.createNamespace<WorkflowRuntimeDB>(
        "workflow_runtime",
      );
    suite.service = testRuntime({
      relationalDb: suite.relational,
      reactorClient: client as never,
      waitpointBaseUrl: BASE_URL,
      ...options.runtime,
    });
  });
  afterAll(async () => {
    suite.service.shutdown();
    for (const service of extra) service.shutdown();
    packagePieces.reset();
    await rm(suite.dir, { recursive: true, force: true });
  });
  return suite;
}
