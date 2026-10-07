// A runtime shut down after losing the workflow singleton sits on a reactor
// that keeps serving. Nothing may run after it, and nothing it adopted may be
// left PENDING for the next owner to mistake for a fire already handled.
import { actions } from "@powerhousedao/workflow/document-models/workflow";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WebhookRequest } from "@powerhousedao/shared/processors";
import { Documents } from "../../test/helpers/documents.js";
import {
  CORE_PIECE_VERSION,
  type PieceWorker,
  type PieceWorkerResult,
} from "../pieces/index.js";
import { packagePieces } from "./piece-registry.js";
import { effectiveRunPolicy } from "./policy.js";
import { coreTrigger } from "./core-blocks.js";
import { REACTOR_PIECE } from "./reactor-piece.js";
import type { WorkflowRunGate } from "./run-gate.js";
import {
  WorkflowRuntimeClosedError,
  type WorkflowRuntimeService,
} from "./service.js";
import { WorkflowRunStore } from "./store.js";
import {
  TriggerSupervisor,
  type TriggerSupervisorOptions,
} from "./trigger-supervisor.js";
import { testRuntime } from "../../test/helpers/runtime.js";

const WORKFLOW_TYPE = "powerhouse/workflow";
const policy = { concurrency: "QUEUE", onFailure: "IGNORE" };
const state = {
  name: "Queued watcher",
  status: "ENABLED",
  version: 1,
  policy,
  trigger: {
    id: "t1",
    pieceName: REACTOR_PIECE,
    pieceVersion: "1.0.0",
    triggerName: "document-event",
    config: { documentType: "powerhouse/note", actionType: "SET_TITLE" },
  },
  steps: [],
  edges: [],
  variables: [],
};

let seq = 0;
let service: WorkflowRuntimeService | undefined;

function runtime(global: Record<string, unknown> = state): {
  service: WorkflowRuntimeService;
  workflowId: string;
} {
  seq += 1;
  const workflowId = `wf-shutdown-${seq}`;
  service = testRuntime({
    reactorClient: {
      find: () => Promise.resolve({ results: [] }),
      get: (id: string) =>
        Promise.resolve({
          header: { id, documentType: WORKFLOW_TYPE, name: id },
          state: { global },
        }),
    },
  } as never);
  return { service, workflowId };
}

const webhookState = (responseMode: "async" | "sync") => ({
  ...state,
  trigger: {
    id: "t1",
    pieceName: "@powerhousedao/piece-core",
    pieceVersion: CORE_PIECE_VERSION,
    triggerName: "webhook",
    config: { scheme: "none", responseMode },
  },
});

// Arms a QUEUE webhook workflow and holds its only slot.
async function queuedWebhook(responseMode: "async" | "sync") {
  const global = webhookState(responseMode);
  const { service, workflowId } = runtime(global);
  await service.onOperations([
    {
      operation: {
        index: seq,
        timestampUtcMs: `${seq}`,
        action: { type: "SET_WORKFLOW_NAME", input: {} },
        resultingState: JSON.stringify(global),
      },
      context: {
        documentId: workflowId,
        documentType: WORKFLOW_TYPE,
        scope: "global",
        branch: "main",
        ordinal: seq,
      },
    } as never,
  ]);
  const store = (await service.store())!;
  const slot = await gateOf(service).admit(
    workflowId,
    effectiveRunPolicy({ policy } as never),
  );
  const request = {
    key: workflowId,
    method: "POST",
    path: "/webhooks/0123456789abcdef0123456789abcdef",
    queryParams: {},
    headers: { "content-type": "application/json" },
    raw: Buffer.from('{"id":"evt_1"}', "utf8"),
    body: { id: "evt_1" },
  } as unknown as WebhookRequest;
  return { service, workflowId, store, slot, request };
}

// The payload a webhook run journals for `request`.
const deliveredBody = (run: { trigger_payload: string | null } | undefined) =>
  (JSON.parse(run!.trigger_payload!) as { body: unknown }).body;

const gateOf = (runtimeService: WorkflowRuntimeService) =>
  (runtimeService as unknown as { runGate: WorkflowRunGate }).runGate;

const within = <T>(promise: Promise<T>, ms = 2_000) =>
  Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`still pending after ${ms}ms`)), ms),
    ),
  ]);

afterEach(() => {
  service?.shutdown();
  service = undefined;
  vi.restoreAllMocks();
});

describe("a runtime that has shut down", () => {
  it("fails the PENDING row a trigger handed it instead of leaving it", async () => {
    const { service, workflowId } = runtime();
    const store = (await service.store())!;
    const runId = await store.enqueueRun({
      workflowId,
      triggerKind: "document-event",
      triggerPayload: { documentId: "doc-1" },
    });
    service.shutdown();

    await expect(
      service.fire(
        workflowId,
        {},
        "document-event",
        undefined,
        undefined,
        runId,
      ),
    ).rejects.toThrow("shut down");

    expect((await store.getRun(runId))?.status).toBe("FAILED");
  });

  it("refuses a firing that was waiting for its slot", async () => {
    const { service, workflowId } = runtime();
    const store = (await service.store())!;
    const slot = await gateOf(service).admit(
      workflowId,
      effectiveRunPolicy({ policy } as never),
    );
    const runId = await store.enqueueRun({
      workflowId,
      triggerKind: "document-event",
    });
    const firing = service.fire(
      workflowId,
      {},
      "document-event",
      undefined,
      undefined,
      runId,
    );
    await vi.waitFor(() => expect(gateOf(service).waiting(workflowId)).toBe(1));

    service.shutdown();

    await expect(within(firing)).rejects.toBeInstanceOf(
      WorkflowRuntimeClosedError,
    );
    expect((await store.getRun(runId))?.status).toBe("FAILED");
    if (slot.admitted) slot.release();
  });

  it("refuses a firing handed its slot as the runtime shut down", async () => {
    const { service, workflowId } = runtime();
    const store = (await service.store())!;
    const slot = await gateOf(service).admit(
      workflowId,
      effectiveRunPolicy({ policy } as never),
    );
    const runId = await store.enqueueRun({
      workflowId,
      triggerKind: "document-event",
    });
    const firing = service.fire(
      workflowId,
      {},
      "document-event",
      undefined,
      undefined,
      runId,
    );
    await vi.waitFor(() => expect(gateOf(service).waiting(workflowId)).toBe(1));

    if (slot.admitted) slot.release();
    service.shutdown();

    await expect(within(firing)).rejects.toBeInstanceOf(
      WorkflowRuntimeClosedError,
    );
    expect((await store.getRun(runId))?.status).toBe("FAILED");
  });

  // Opening the journal runs its sweeps, which would fail the next owner's
  // live runs.
  // Built lazily, so the first caller after shutdown would otherwise get a
  // fresh, running lane over the journal the next owner holds.
  // The cursor is past the item, so the refused firing must leave its run.
  it("fails the run a queued piece item journaled, with its payload", async () => {
    const { service, workflowId } = runtime();
    const store = (await service.store())!;
    const item = { id: "item-1", _dedupe_key: "item-1" };
    const output = (hook: string): PieceWorkerResult => ({
      output:
        hook === "run"
          ? [item]
          : { triggers: [{ name: "new_thing", strategy: "POLLING" }] },
      touched: [],
      tlsPoisoned: false,
    });
    const poller = new TriggerSupervisor({
      store: () => service.store(),
      resolveAuth: () => Promise.resolve(undefined),
      fire: (
        service.supervisor() as unknown as { options: TriggerSupervisorOptions }
      ).options.fire,
      cacheDir: "/nonexistent",
      resolver: {
        resolve: (target) =>
          Promise.resolve({
            ...target,
            bundleDir: "/nonexistent",
            local: false,
          }),
      },
      worker: {
        describePiece: () => Promise.resolve(output("describe")),
        runTriggerHook: (request: { hook: string }) =>
          Promise.resolve(output(request.hook)),
        dispose: () => undefined,
      } as unknown as PieceWorker,
    });
    const block = {
      pieceName: "@acme/piece-x",
      pieceVersion: "1.0.0",
      kind: "trigger" as const,
      name: "new_thing",
    };
    await poller.upsert({
      workflowId,
      block,
      packageName: block.pieceName,
      version: "1.0.0",
      triggerName: "new_thing",
      config: {},
      connectionId: null,
    });
    const row = await store.getTriggerState(workflowId);
    await store.upsertTriggerState({
      ...row!,
      next_poll_at: "2000-01-01T00:00:00.000Z",
    });
    const slot = await gateOf(service).admit(
      workflowId,
      effectiveRunPolicy({ policy } as never),
    );

    await poller.tick();
    await vi.waitFor(() => expect(gateOf(service).waiting(workflowId)).toBe(1));
    service.shutdown();
    poller.stop();

    await vi.waitFor(async () => {
      const runs = await store.listRuns(workflowId);
      expect(runs).toHaveLength(1);
      expect(runs[0]).toMatchObject({
        status: "FAILED",
        error_name: "WorkflowRuntimeClosedError",
      });
      expect(JSON.parse(runs[0]!.trigger_payload!)).toEqual(item);
    });
    if (slot.admitted) slot.release();
  });

  // The slot is consumed with the fire, so the refused run is its only record.
  it("fails the run a queued schedule slot journaled, with its payload", async () => {
    const { service, workflowId } = runtime();
    const store = (await service.store())!;
    const poller = new TriggerSupervisor({
      store: () => service.store(),
      resolveAuth: () => Promise.resolve(undefined),
      fire: (
        service.supervisor() as unknown as { options: TriggerSupervisorOptions }
      ).options.fire,
      cacheDir: "/nonexistent",
      resolver: {
        resolve: () => Promise.reject(new Error("no pieces here")),
      },
      worker: { dispose: () => undefined } as unknown as PieceWorker,
    });
    await poller.upsert({
      kind: "schedule",
      workflowId,
      block: coreTrigger("schedule"),
      config: { mode: "interval", every: 1, unit: "minutes" },
    });
    const row = await store.getTriggerState(workflowId);
    await store.upsertTriggerState({
      ...row!,
      next_poll_at: "2000-01-01T00:00:00.000Z",
    });
    const slot = await gateOf(service).admit(
      workflowId,
      effectiveRunPolicy({ policy } as never),
    );

    await poller.tick();
    await vi.waitFor(() => expect(gateOf(service).waiting(workflowId)).toBe(1));
    service.shutdown();
    poller.stop();

    await vi.waitFor(async () => {
      const runs = await store.listRuns(workflowId);
      expect(runs).toHaveLength(1);
      expect(runs[0]).toMatchObject({
        status: "FAILED",
        error_name: "WorkflowRuntimeClosedError",
        trigger_kind: "schedule",
      });
      expect(JSON.parse(runs[0]!.trigger_payload!)).toMatchObject({
        everyMs: 60_000,
      });
    });
    if (slot.admitted) slot.release();
  });

  // The sender was answered, so it never retries: the run is the record.
  it("fails the run of an async webhook delivery queued at shutdown, with its payload", async () => {
    const { service, workflowId, store, slot, request } =
      await queuedWebhook("async");

    const reply = await service.deliverWebhook(request);
    expect(reply.status).toBe(202);
    await vi.waitFor(() => expect(gateOf(service).waiting(workflowId)).toBe(1));
    service.shutdown();

    await vi.waitFor(async () => {
      const runs = await store.listRuns(workflowId);
      expect(runs).toHaveLength(1);
      expect(runs[0]).toMatchObject({
        status: "FAILED",
        error_name: "WorkflowRuntimeClosedError",
      });
      expect(deliveredBody(runs[0])).toEqual({ id: "evt_1" });
    });
    if (slot.admitted) slot.release();
  });

  // After the 504 the sender's retry is absorbed as a duplicate.
  it("fails the run of a sync webhook delivery that timed out and queued at shutdown", async () => {
    const { service, workflowId, store, slot, request } =
      await queuedWebhook("sync");
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const pending = service.deliverWebhook(request);
      await vi.waitFor(() =>
        expect(gateOf(service).waiting(workflowId)).toBe(1),
      );
      await vi.advanceTimersByTimeAsync(30_000);
      expect((await pending).status).toBe(504);
    } finally {
      vi.useRealTimers();
    }
    service.shutdown();

    await vi.waitFor(async () => {
      const runs = await store.listRuns(workflowId);
      expect(runs).toHaveLength(1);
      expect(runs[0]).toMatchObject({
        status: "FAILED",
        error_name: "WorkflowRuntimeClosedError",
      });
      expect(deliveredBody(runs[0])).toEqual({ id: "evt_1" });
    });
    if (slot.admitted) slot.release();
  });

  // Answered 503, so the sender's retry is the record and the run is not rerunnable.
  it("cancels the run of a sync webhook delivery refused before its reply", async () => {
    const { service, workflowId, store, slot, request } =
      await queuedWebhook("sync");

    const pending = service.deliverWebhook(request);
    await vi.waitFor(() => expect(gateOf(service).waiting(workflowId)).toBe(1));
    service.shutdown();

    expect(await within(pending)).toMatchObject({
      status: 503,
      unprocessed: true,
    });
    const runs = await store.listRuns(workflowId);
    expect(runs).toHaveLength(1);
    expect(runs[0]?.status).toBe("CANCELLED");
    expect(runs[0]?.error).toContain("Redelivered");
    if (slot.admitted) slot.release();
  });

  it("hands out only a stopped trigger supervisor", async () => {
    const { service, workflowId } = runtime();
    const store = (await service.store())!;
    service.shutdown();

    const parked = await service
      .supervisor()
      .park(workflowId, 1, "after shutdown")
      .catch((error: unknown) => error);

    expect(await store.getWorkflowPark(workflowId)).toBeUndefined();
    expect(parked).toBeInstanceOf(Error);
  });

  // Refusing queued lane work is what shutdown is for, not a failure to page on.
  it("logs lane work the stopped supervisor refused below error level", async () => {
    const logged = { error: [] as string[], debug: [] as string[] };
    const logger = {
      info: () => undefined,
      warn: () => undefined,
      verbose: () => undefined,
      debug: (message: string) => logged.debug.push(message),
      error: (message: string) => logged.error.push(message),
      child: () => logger,
    };
    service = testRuntime({
      reactorClient: { find: () => Promise.resolve({ results: [] }) },
      logger,
    } as never);
    service.shutdown();

    (
      service as unknown as { dropSupervised(workflowId: string): void }
    ).dropSupervised("wf-refused");

    await vi.waitFor(() =>
      expect(logged.debug).toContain("Trigger disable failed for wf-refused"),
    );
    expect(logged.error).toEqual([]);
  });

  it("does not reopen a journal that failed to open", async () => {
    const create = vi
      .spyOn(WorkflowRunStore, "create")
      .mockRejectedValueOnce(new Error("database restarting"));
    const { service } = runtime();
    expect(await service.store()).toBeUndefined();
    (service as unknown as { storeReopenAt: number }).storeReopenAt = 0;

    service.shutdown();

    expect(await service.store()).toBeUndefined();
    expect(create).toHaveBeenCalledTimes(1);
  });
});

const HANG_PIECE = "@acme/piece-shutdown";
const HANG_FIXTURE = `
export const shutdown = {
  displayName: "Shutdown",
  actions: {
    hang: {
      name: "hang",
      displayName: "Hang",
      props: {},
      run: () => new Promise(() => {}),
    },
  },
  triggers: {},
};
`;

// Losing the singleton kills the runs in flight. A park written then lands in
// a journal the next owner holds, behind its seeded park state.
describe("a run the shutdown killed", () => {
  it("does not park its workflow", async () => {
    const dir = await mkdtemp(join(tmpdir(), "rw-shutdown-"));
    try {
      const entryPath = join(dir, "index.mjs");
      await writeFile(entryPath, HANG_FIXTURE);
      packagePieces.setPieces([
        { name: HANG_PIECE, version: "1.0.0", entryPath },
      ]);
      const documents = new Documents();
      const workflowId = "wf-shutdown-killed";
      documents.apply(
        workflowId,
        actions.setTrigger({
          id: "t1",
          pieceName: "@powerhousedao/piece-core",
          pieceVersion: CORE_PIECE_VERSION,
          triggerName: "manual",
          config: {},
        }),
        actions.addStep({
          id: "a",
          key: "only",
          name: "Only",
          pieceName: HANG_PIECE,
          pieceVersion: "1.0.0",
          actionName: "hang",
          config: {},
        }),
        actions.addEdge({ id: "e1", from: "t1", to: "a", port: "next" }),
        actions.setPolicy({ onFailure: "PARK" } as never),
        actions.publishWorkflow({ publishedAt: "2026-01-01T00:00:00.000Z" }),
        actions.setWorkflowStatus({ status: "ENABLED" }),
      );
      service = testRuntime({ reactorClient: documents.client() as never });
      const running = service;
      const store = (await running.store())!;

      const firing = running.fire(workflowId, undefined, "schedule");
      await vi.waitFor(
        async () =>
          expect((await store.listRuns(workflowId))[0]?.status).toBe("RUNNING"),
        { timeout: 15_000 },
      );
      running.shutdown();
      await within(
        firing.catch(() => undefined),
        15_000,
      );

      expect(await store.getWorkflowPark(workflowId)).toBeUndefined();
    } finally {
      packagePieces.reset();
      await rm(dir, { recursive: true, force: true });
    }
  }, 30_000);
});
