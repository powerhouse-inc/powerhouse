// Every run gets a worker of its own, for the length of that run. Real forked
// children: a fixture piece reports the pid it ran in.
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
import { testRuntime } from "../../test/helpers/runtime.js";
import { CORE_PIECE_VERSION } from "../pieces/index.js";
import { packagePieces } from "./piece-registry.js";
import type { WorkflowRuntimeService } from "./service.js";

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
        return {};
      },
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

  afterEach(() => {
    service?.shutdown();
    service = undefined;
    vi.unstubAllEnvs();
  });

  afterAll(async () => {
    packagePieces.reset();
    await rm(dir, { recursive: true, force: true });
  });

  it("runs every step of a run in one child", async () => {
    service = serviceFor(() =>
      Promise.resolve(workflowDocument(["pid", "pid"])),
    );

    const result = await fireManually(service);

    expect(result.status).toBe("SUCCEEDED");
    const [first, second] = result.steps.map((step) => pidOf(step.output));
    expect(first).not.toBe(process.pid);
    // A piece loaded by the first step is still loaded for the second.
    expect(second).toBe(first);
  });

  it("gives concurrent runs different children", async () => {
    vi.stubEnv("PH_WORKFLOWS_RUN_CONCURRENCY", "2");
    service = serviceFor(() => Promise.resolve(workflowDocument(["pid"])));

    const runs = await Promise.all([
      fireManually(service),
      fireManually(service),
    ]);

    const pids = runs.map((run) => pidOf(run.steps[0]?.output));
    expect(new Set(pids).size).toBe(2);
  });

  it("closes the run's child however the run ends", async () => {
    // One slot: a failed run that kept it would hang the next one.
    vi.stubEnv("PH_WORKFLOWS_RUN_CONCURRENCY", "1");
    let actions = ["pid", "boom"];
    service = serviceFor(() => Promise.resolve(workflowDocument(actions)));

    const failed = await fireManually(service);

    expect(failed.status).toBe("FAILED");
    const child = pidOf(failed.steps[0]?.output);
    await vi.waitFor(() => expect(isAlive(child)).toBe(false));

    actions = ["pid"];
    await expect(fireManually(service)).resolves.toMatchObject({
      status: "SUCCEEDED",
    });
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

    // The disposed pool is kept, so the run fails instead of forking into a
    // replacement.
    await expect(run).rejects.toThrow("disposed");
  });
});
