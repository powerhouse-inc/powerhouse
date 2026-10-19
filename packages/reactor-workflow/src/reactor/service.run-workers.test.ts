// Runs lease warm children per request from one pool. Real forked children:
// a fixture piece reports the pid it ran in.
import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { createFreshRelationalDb } from "../../test/helpers/pglite.js";
import { testRuntime } from "../../test/helpers/runtime.js";
import { CORE_PIECE_VERSION } from "../pieces/index.js";
import { packagePieces } from "./piece-registry.js";
import {
  PENDING_SWEEP_INTERVAL_MS,
  type WorkflowRuntimeService,
} from "./service.js";
import { WorkflowRunStore, type WorkflowRuntimeDB } from "./store.js";

const PIECE = "@acme/piece-pids";
const WORKFLOW_ID = "wf-workers";
// A step on the in-process core piece, which needs no child.
const CORE_ASSERT = "core:assert";

const fixture = (dir: string) => `
import { existsSync, writeFileSync } from "node:fs";
export const pids = {
  displayName: "Pids",
  actions: {
    pid: {
      name: "pid",
      displayName: "Pid",
      props: {},
      run: async () => ({ pid: process.pid }),
    },
    hold: {
      name: "hold",
      displayName: "Hold",
      props: {},
      run: async () => {
        writeFileSync(${JSON.stringify(join(dir, "held"))}, "");
        while (!existsSync(${JSON.stringify(join(dir, "release"))})) {
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
        return { pid: process.pid };
      },
    },
    heap: {
      name: "heap",
      displayName: "Heap",
      props: {},
      run: async () => ({ execArgv: process.execArgv }),
    },
    boom: {
      name: "boom",
      displayName: "Boom",
      props: {},
      run: async () => {
        throw new Error("boom");
      },
    },
    pick: {
      name: "pick",
      displayName: "Pick",
      props: {
        choice: {
          type: "DROPDOWN",
          displayName: "Choice",
          required: true,
          refreshers: [],
          options: async () => ({
            options: [{ label: "pid", value: process.pid }],
          }),
        },
      },
      run: async () => ({}),
    },
  },
  triggers: {},
};
`;

// A workflow edit as the read model delivers it.
let ordinal = 0;
function workflowOp(document: { state: { global: unknown } }) {
  ordinal += 1;
  return {
    operation: {
      index: ordinal,
      timestampUtcMs: `${ordinal}`,
      action: { type: "EDIT", input: {} },
      resultingState: JSON.stringify(document.state.global),
    },
    context: {
      documentId: WORKFLOW_ID,
      documentType: "powerhouse/workflow",
      scope: "global",
      branch: "main",
      ordinal,
    },
  } as never;
}

function workflowDocument(actions: string[]) {
  const steps = actions.map((actionName, i) => ({
    id: `s${i}`,
    key: `step${i}`,
    ...(actionName === CORE_ASSERT
      ? {
          pieceName: "@powerhousedao/piece-core",
          pieceVersion: CORE_PIECE_VERSION,
          actionName: "assert",
          config: { value: "ok" },
        }
      : { pieceName: PIECE, pieceVersion: "1.0.0", actionName, config: {} }),
  }));
  return {
    header: { documentType: "powerhouse/workflow" },
    state: {
      global: {
        name: "Workers",
        status: "ENABLED",
        version: 1,
        trigger: {
          id: "t1",
          pieceName: "@powerhousedao/piece-core",
          pieceVersion: CORE_PIECE_VERSION,
          triggerName: "manual",
          config: {},
        },
        steps,
        edges: steps.map((step, i) => ({
          id: `e${i}`,
          from: i === 0 ? "t1" : `s${i - 1}`,
          to: step.id,
          port: "next",
        })),
        variables: [],
      },
    },
  };
}

// A manual fire is the caller-facing path, so it carries one.
const CTX = { headers: {}, db: {}, user: { address: "0xabc" } } as never;

const pidOf = (output: unknown) => (output as { pid: number }).pid;

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function serviceFor(get: () => Promise<unknown>): WorkflowRuntimeService {
  return testRuntime({ reactorClient: { get } } as never);
}

const fireManually = (service: WorkflowRuntimeService) =>
  service.fire(WORKFLOW_ID, undefined, "manual", undefined, CTX);

describe("fire() and the worker pool", () => {
  let dir = "";
  let service: WorkflowRuntimeService | undefined;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "ph-run-workers-"));
    const entryPath = join(dir, "index.mjs");
    await writeFile(entryPath, fixture(dir));
    packagePieces.setPieces([{ name: PIECE, version: "1.0.0", entryPath }]);
  });

  afterEach(async () => {
    service?.shutdown();
    service = undefined;
    vi.unstubAllEnvs();
    vi.useRealTimers();
    // The hold action's markers, so the next hold waits again.
    await rm(join(dir, "held"), { force: true });
    await rm(join(dir, "release"), { force: true });
  });

  afterAll(async () => {
    packagePieces.reset();
    await rm(dir, { recursive: true, force: true });
  });

  it("serves every step of a run from one warm child", async () => {
    service = serviceFor(() =>
      Promise.resolve(workflowDocument(["pid", "pid"])),
    );

    const result = await fireManually(service);

    expect(result.status).toBe("SUCCEEDED");
    const [first, second] = result.steps.map((step) => pidOf(step.output));
    expect(first).not.toBe(process.pid);
    // The idle child with the piece loaded serves the second step too.
    expect(second).toBe(first);
  });

  it("serves the next run from the child the last run left warm", async () => {
    service = serviceFor(() => Promise.resolve(workflowDocument(["pid"])));

    const first = await fireManually(service);
    const second = await fireManually(service);

    expect(pidOf(second.steps[0]?.output)).toBe(pidOf(first.steps[0]?.output));
  });

  it("keeps the child warm after a run fails", async () => {
    vi.stubEnv("PH_WORKFLOWS_RUN_CONCURRENCY", "1");
    let actions = ["pid", "boom"];
    service = serviceFor(() => Promise.resolve(workflowDocument(actions)));

    const failed = await fireManually(service);
    expect(failed.status).toBe("FAILED");

    actions = ["pid"];
    const next = await fireManually(service);
    expect(next.status).toBe("SUCCEEDED");
    expect(pidOf(next.steps[0]?.output)).toBe(pidOf(failed.steps[0]?.output));
  });

  it("gives steps in flight at once different children", async () => {
    vi.stubEnv("PH_WORKFLOWS_RUN_CONCURRENCY", "2");
    let actions = ["hold"];
    service = serviceFor(() => Promise.resolve(workflowDocument(actions)));
    const holding = fireManually(service);
    await vi.waitFor(() => access(join(dir, "held")), { timeout: 10_000 });

    actions = ["pid"];
    const other = await fireManually(service);
    await writeFile(join(dir, "release"), "");
    const held = await holding;

    expect(pidOf(other.steps[0]?.output)).not.toBe(
      pidOf(held.steps[0]?.output),
    );
  });

  it("holds a run past PH_WORKFLOWS_RUNS_IN_FLIGHT until one ends", async () => {
    vi.stubEnv("PH_WORKFLOWS_RUNS_IN_FLIGHT", "1");
    let actions = ["hold"];
    service = serviceFor(() => Promise.resolve(workflowDocument(actions)));
    const holding = fireManually(service);
    await vi.waitFor(() => access(join(dir, "held")), { timeout: 10_000 });

    actions = ["pid"];
    let second: { status: string } | undefined;
    const waiting = fireManually(service).then((run) => (second = run));
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(second).toBeUndefined();
    // Journaled while it waits, so a crash now leaves it to the next boot.
    const runs = await (await service.store())!.listRuns(WORKFLOW_ID);
    expect(runs.map((run) => run.status)).toContain("PENDING");

    await writeFile(join(dir, "release"), "");
    await expect(holding).resolves.toMatchObject({ status: "SUCCEEDED" });
    await expect(waiting).resolves.toMatchObject({ status: "SUCCEEDED" });
  });

  it("re-reads the workflow after a run waits past the in-flight cap", async () => {
    vi.stubEnv("PH_WORKFLOWS_RUNS_IN_FLIGHT", "1");
    let actions = ["hold"];
    let status = "ENABLED";
    service = serviceFor(() => {
      const document = workflowDocument(actions);
      document.state.global.status = status;
      return Promise.resolve(document);
    });
    const holding = fireManually(service);
    await vi.waitFor(() => access(join(dir, "held")), { timeout: 10_000 });

    actions = ["pid"];
    const waiting = fireManually(service);
    await new Promise((resolve) => setTimeout(resolve, 200));
    // Disabled while the second run waits at the dispatcher.
    status = "DISABLED";
    await service.onOperations([workflowOp(workflowDocument(actions))]);
    await writeFile(join(dir, "release"), "");

    await expect(holding).resolves.toMatchObject({ status: "SUCCEEDED" });
    await expect(waiting).resolves.toMatchObject({
      status: "CANCELLED",
      refusal: "stale",
    });
  });

  it("re-reads nothing after a wait no operation landed in", async () => {
    vi.stubEnv("PH_WORKFLOWS_RUNS_IN_FLIGHT", "1");
    let actions = ["hold"];
    const get = vi.fn(() => Promise.resolve(workflowDocument(actions)));
    service = serviceFor(get);
    const holding = fireManually(service);
    await vi.waitFor(() => access(join(dir, "held")), { timeout: 10_000 });

    actions = ["pid"];
    const waiting = fireManually(service);
    await new Promise((resolve) => setTimeout(resolve, 200));
    await writeFile(join(dir, "release"), "");

    await expect(holding).resolves.toMatchObject({ status: "SUCCEEDED" });
    await expect(waiting).resolves.toMatchObject({ status: "SUCCEEDED" });
    // One load per manual fire, none after the wait.
    expect(get).toHaveBeenCalledTimes(2);
  });

  it("starts the runs a stopped reactor journaled once it starts", async () => {
    const relationalDb = createFreshRelationalDb();
    const stopped = await WorkflowRunStore.create(relationalDb);
    const runId = await stopped.enqueueRun({
      workflowId: WORKFLOW_ID,
      triggerKind: "schedule",
    });
    service = testRuntime({
      relationalDb,
      reactorClient: {
        get: () => Promise.resolve(workflowDocument(["pid"])),
      } as never,
    });

    service.startTriggerSupervisor();

    const store = await service.store();
    await vi.waitFor(
      async () =>
        expect((await store!.getRun(runId))?.status).toBe("SUCCEEDED"),
      { timeout: 10_000 },
    );
  });

  it("starts a run a peer leaves PENDING after the boot pass", async () => {
    vi.useFakeTimers({ toFake: ["setInterval"] });
    const relationalDb = createFreshRelationalDb();
    service = testRuntime({
      relationalDb,
      reactorClient: {
        get: () => Promise.resolve(workflowDocument(["pid"])),
      } as never,
    });
    service.startTriggerSupervisor();
    const store = await service.store();

    // A draining owner's row, journaled once this boot had already looked.
    const peer = await WorkflowRunStore.create(relationalDb);
    const runId = await peer.enqueueRun({
      workflowId: WORKFLOW_ID,
      triggerKind: "schedule",
    });
    const db =
      await relationalDb.createNamespace<WorkflowRuntimeDB>("workflow_runtime");
    await db
      .updateTable("run")
      .set({ enqueued_at: new Date(Date.now() - 120_000).toISOString() })
      .where("id", "=", runId)
      .execute();
    expect((await store!.getRun(runId))?.status).toBe("PENDING");

    await vi.advanceTimersByTimeAsync(PENDING_SWEEP_INTERVAL_MS);
    vi.useRealTimers();

    await vi.waitFor(
      async () =>
        expect((await store!.getRun(runId))?.status).toBe("SUCCEEDED"),
      { timeout: 10_000 },
    );
  });

  it("caps each child's heap at PH_WORKFLOWS_WORKER_MEMORY_MB", async () => {
    vi.stubEnv("PH_WORKFLOWS_WORKER_MEMORY_MB", "64");
    service = serviceFor(() => Promise.resolve(workflowDocument(["heap"])));

    const result = await fireManually(service);

    const output = result.steps[0]?.output as { execArgv: string[] };
    expect(output.execArgv).toContain("--max-old-space-size=64");
  });

  it("takes no child for a run without piece steps", async () => {
    // One slot, held by a piece run: a core-only run that took it would wait.
    vi.stubEnv("PH_WORKFLOWS_RUN_CONCURRENCY", "1");
    let actions = ["hold"];
    service = serviceFor(() => Promise.resolve(workflowDocument(actions)));
    const holding = fireManually(service);
    await vi.waitFor(() => access(join(dir, "held")), { timeout: 10_000 });

    actions = [CORE_ASSERT];
    await expect(fireManually(service)).resolves.toMatchObject({
      status: "SUCCEEDED",
    });

    await writeFile(join(dir, "release"), "");
    await expect(holding).resolves.toMatchObject({ status: "SUCCEEDED" });
  });

  it("takes the design worker with it on shutdown", async () => {
    service = serviceFor(() => Promise.reject(new Error("not used")));
    const options = (await service.blockOptions(
      { pieceName: PIECE, pieceVersion: "1.0.0", kind: "action", name: "pick" },
      "choice",
    )) as { options: { value: number }[] };
    const designPid = options.options[0]!.value;
    expect(isAlive(designPid)).toBe(true);

    service.shutdown();

    // Forked on the editor's first request and never replaced, so a reload
    // leaves it running unless shutdown ends it too.
    await vi.waitFor(() => expect(isAlive(designPid)).toBe(false));
  });

  it("builds the trigger supervisor after shutdown and forks nothing for it", async () => {
    service = serviceFor(() => Promise.reject(new Error("not used")));
    service.shutdown();

    expect(() => service?.supervisor()).not.toThrow();
    await expect(
      service.blockOptions(
        {
          pieceName: PIECE,
          pieceVersion: "1.0.0",
          kind: "action",
          name: "pick",
        },
        "choice",
      ),
    ).rejects.toThrow("disposed");
  });

  it("refuses a run whose journal write a shutdown lands in, piece steps or not", async () => {
    service = serviceFor(() =>
      Promise.resolve(workflowDocument([CORE_ASSERT])),
    );
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let entered!: () => void;
    const writing = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const spy = vi
      .spyOn(WorkflowRunStore.prototype, "beginRun")
      .mockImplementationOnce(async function (this: WorkflowRunStore, ...args) {
        entered();
        await held;
        // The one-off is spent, so this reaches the real beginRun.
        return this.beginRun(...args);
      });

    // An adopted row, so the write held is beginRun on any fire path.
    const runId = await (await service.store())!.enqueueRun({
      workflowId: WORKFLOW_ID,
      triggerKind: "schedule",
    });
    const run = service.fire(
      WORKFLOW_ID,
      undefined,
      "schedule",
      undefined,
      undefined,
      runId,
    );
    await writing;
    service.shutdown();
    release();

    await expect(run).rejects.toThrow("shut down");
    spy.mockRestore();
  });

  it("refuses a run that reaches the pool after shutdown", async () => {
    let release: (() => void) | undefined;
    let hold = false;
    service = serviceFor(() =>
      hold
        ? new Promise((resolve) => {
            release = () => resolve(workflowDocument(["pid"]));
          })
        : Promise.resolve(workflowDocument(["pid"])),
    );
    // The pool exists once a run has used it.
    await expect(fireManually(service)).resolves.toMatchObject({
      status: "SUCCEEDED",
    });

    // Held between its first await and the pool, where a teardown lands.
    hold = true;
    const run = fireManually(service);
    await vi.waitFor(() => expect(release).toBeDefined());
    service.shutdown();
    release?.();

    // Refused at the check after admission, before it reaches the pool, so
    // it never forks into a replacement.
    await expect(run).rejects.toThrow("shut down");
  });
});
