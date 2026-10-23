import type {
  Action,
  DocumentModelDocument,
  Operation,
  PHDocument,
} from "@powerhousedao/shared/document-model";
import {
  addModule,
  deriveOperationId,
  retract,
} from "@powerhousedao/shared/document-model";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { InProcessReactorModule } from "../../src/core/types.js";
import * as derivation from "../../src/derivation/index.js";
import { JobStatus, type JobInfo } from "../../src/shared/types.js";
import {
  createBaseReducer3Document,
  createUndoV3ReactorBuilder,
} from "../factories.js";
import { assertOneRuleAgreement, storedRows } from "./one-rule-agreement.js";

vi.mock("../../src/derivation/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof derivation>();
  return { ...actual, scopeDerivation: vi.fn(actual.scopeDerivation) };
});

const scopeDerivation = vi.mocked(derivation.scopeDerivation);

function shape(stream: Operation[]): string {
  return stream
    .map((operation) => {
      const input = operation.action.input as { id?: string; target?: string };
      const label =
        operation.action.type === "RETRACT"
          ? `R(${input.target})`
          : (input.id ?? operation.action.type);
      return `${operation.index}:${label}/${operation.skip}`;
    })
    .join(" ");
}

describe("base-reducer 3: a write repeating a stored row's action id", () => {
  let module: InProcessReactorModule | undefined;
  let document: PHDocument;
  let docId: string;
  let base: number;

  afterEach(() => {
    module?.reactor.kill();
    module = undefined;
    scopeDerivation.mockClear();
  });

  async function build(
    options: { log?: boolean; batchApplies?: boolean } = {},
  ): Promise<void> {
    module = await createUndoV3ReactorBuilder()
      .withExecutorConfig({
        batchApplies: options.batchApplies ?? true,
        ...(options.log ? { signatureVerification: "log" as const } : {}),
      })
      .withWriteCacheConfig({ keyframeInterval: 2 })
      .buildModule();
    document = createBaseReducer3Document({ signaturePolicy: "legacy" });
    docId = document.header.id;
    const created = await settle(await module.reactor.create(document));
    expect(created.error?.message ?? created.status).toBe(JobStatus.READ_READY);
    base = Date.now() + 60_000;
  }

  async function settle(job: JobInfo): Promise<JobInfo> {
    await vi.waitUntil(
      async () => {
        const { status } = await module!.reactor.getJobStatus(job.id);
        return status === JobStatus.READ_READY || status === JobStatus.FAILED;
      },
      { timeout: 10_000 },
    );
    return module!.reactor.getJobStatus(job.id);
  }

  function add(id: string, offsetMs: number, actionId?: string): Action {
    return {
      ...addModule({ id, name: id }),
      ...(actionId === undefined ? {} : { id: actionId }),
      timestampUtcMs: new Date(base + offsetMs).toISOString(),
    };
  }

  function retractAt(target: string, offsetMs: number): Action {
    return {
      ...retract(target, "global"),
      timestampUtcMs: new Date(base + offsetMs).toISOString(),
    };
  }

  function asOperation(action: Action, index: number): Operation {
    return {
      id: deriveOperationId(docId, action.scope, "main", action.id),
      index,
      skip: 0,
      hash: "",
      timestampUtcMs: action.timestampUtcMs,
      action,
    };
  }

  async function execute(actions: Action[]): Promise<void> {
    const job = await settle(
      await module!.reactor.execute(docId, "main", actions),
    );
    expect(job.error?.message ?? job.status).toBe(JobStatus.READ_READY);
  }

  async function load(operations: Operation[]): Promise<void> {
    const job = await settle(
      await module!.reactor.load(docId, "main", operations),
    );
    expect(job.error?.message ?? job.status).toBe(JobStatus.READ_READY);
  }

  async function modules(): Promise<string[]> {
    const served = await module!.reactor.get<DocumentModelDocument>(docId);
    return served.state.global.specifications[0].modules.map(
      (entry) => entry.id,
    );
  }

  it("re-derives the scope once in a plain reshuffle, however many rows it re-appends", async () => {
    await build();
    await execute([add("w", 20), add("x", 30), add("y", 40), add("z", 50)]);

    scopeDerivation.mockClear();
    await load([asOperation(add("v", 0), 4)]);

    expect(shape(await storedRows(module!, docId))).toBe(
      "0:w/0 1:x/0 2:y/0 3:z/0 4:v/4 5:w/0 6:x/0 7:y/0 8:z/0",
    );
    expect(scopeDerivation).toHaveBeenCalledTimes(1);
    expect(await modules()).toEqual(["v", "w", "x", "y", "z"]);
    await assertOneRuleAgreement({ module: module!, document });
  });

  // The re-appended repeat's latest stored copy is content, not the RETRACT.
  it("re-derives a re-appended repeat of a RETRACT's id (log mode)", async () => {
    await build({ log: true });
    const a = add("a", 10);
    const undo = retractAt(a.id, 20);
    await execute([a]);
    await execute([undo]);
    await execute([add("r", 40, undo.id)]);
    expect(await modules()).toEqual(["a", "r"]);

    await load([asOperation(add("y", 30), 3)]);

    expect(shape(await storedRows(module!, docId))).toBe(
      `0:a/0 1:R(${a.id})/0 2:r/0 3:y/1 4:r/0`,
    );
    expect(await modules()).toEqual(["a", "y", "r"]);
    await assertOneRuleAgreement({ module: module!, document });
  });

  it("falls back from a batch whose later write repeats a RETRACT's id (log mode)", async () => {
    await build({ log: true });
    const a = add("a", 10);
    const undo = retractAt(a.id, 20);
    await execute([a]);
    await execute([undo]);
    expect(await modules()).toEqual([]);

    await execute([add("b", 30), add("x", 40, undo.id)]);

    expect(await modules()).toEqual(["a", "b", "x"]);
    await assertOneRuleAgreement({ module: module!, document });
  });
});
