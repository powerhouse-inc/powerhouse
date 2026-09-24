import type {
  Action,
  DocumentModelDocument,
  Operation,
} from "@powerhousedao/shared/document-model";
import {
  addModule,
  deriveOperationId,
  garbageCollect,
  sortOperations,
  undo,
} from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { afterEach, describe, expect, it } from "vitest";
import { ReactorBuilder } from "../../src/core/reactor-builder.js";
import type { InProcessReactorModule } from "../../src/core/types.js";
import type { ReactorFeatureFlags } from "../../src/executor/types.js";
import { JobStatus, type JobInfo } from "../../src/shared/types.js";
import { createDocModelDocument } from "../factories.js";

// Asserted straight after the load: no re-delivery restores what it rewinds.
describe("a load reshuffle", () => {
  let module: InProcessReactorModule | undefined;
  let docId: string;
  let base: number;

  afterEach(() => {
    module?.reactor.kill();
    module = undefined;
  });

  async function build(
    featureFlags: Partial<ReactorFeatureFlags> = {},
  ): Promise<void> {
    module = await new ReactorBuilder()
      .withDocumentModelSources([documentModelDocumentModelModule as never])
      .withExecutorConfig({ featureFlags })
      .buildModule();
    const document = createDocModelDocument({ signaturePolicy: "legacy" });
    docId = document.header.id;
    const created = await settle(await module.reactor.create(document));
    expect(created.error?.message ?? created.status).toBe(JobStatus.READ_READY);
    base = Date.now() + 60_000;
  }

  async function settle(job: JobInfo): Promise<JobInfo> {
    let status = await module!.reactor.getJobStatus(job.id);
    while (
      status.status !== JobStatus.READ_READY &&
      status.status !== JobStatus.FAILED
    ) {
      await new Promise((resolve) => setTimeout(resolve, 5));
      status = await module!.reactor.getJobStatus(job.id);
    }
    return status;
  }

  function moduleAction(id: string, offsetMs: number): Action {
    return {
      ...addModule({ id, name: id }),
      timestampUtcMs: new Date(base + offsetMs).toISOString(),
    };
  }

  function asOperation(action: Action, index: number, skip = 0): Operation {
    return {
      id: deriveOperationId(docId, action.scope, "main", action.id),
      index,
      skip,
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

  async function stored(): Promise<Operation[]> {
    const result = (await module!.reactor.getOperations(docId, {
      branch: "main",
      scopes: ["global"],
    })) as Record<string, { results: Operation[] } | undefined>;
    return result.global?.results ?? [];
  }

  async function live(): Promise<string[]> {
    return garbageCollect(sortOperations(await stored())).map(
      (operation) => (operation.action.input as { id: string }).id,
    );
  }

  async function modules(): Promise<string[]> {
    const document = await module!.reactor.get<DocumentModelDocument>(docId);
    return document.state.global.specifications[0].modules.map(
      (entry) => entry.id,
    );
  }

  it("re-appends a live row stamped before the conflict window", async () => {
    await build();
    await execute([moduleAction("x", 30)]);
    // Not repositioned without documentDecisions: stored after x.
    await execute([moduleAction("y", 10)]);

    await load([asOperation(moduleAction("z", 20), 0)]);

    expect(await live()).toEqual(["y", "z", "x"]);
    expect(await modules()).toEqual(["y", "z", "x"]);
  });

  it("re-appends a live row the predecessor rule leaves out", async () => {
    await build();
    const a = moduleAction("a", 0);
    await load([
      asOperation(a, 0),
      asOperation(moduleAction("b", 10), 1),
      asOperation(moduleAction("c", 20), 2),
    ]);

    await load([asOperation(a, 10), asOperation(moduleAction("d", 15), 11)]);

    expect(await live()).toEqual(["a", "b", "d", "c"]);
    expect(await modules()).toEqual(["a", "b", "d", "c"]);
  });

  it("re-appends a row stored after the earlier head it rewinds to", async () => {
    await build();
    await execute([moduleAction("p", 0)]);
    // q heads a reshuffle at index 1, skip 1.
    await load([asOperation(moduleAction("q", -10), 0)]);
    expect(await live()).toEqual(["q", "p"]);
    await execute([moduleAction("r", -20)]);

    await load([asOperation(moduleAction("s", -15), 0)]);

    expect(await live()).toEqual(["r", "s", "q", "p"]);
    expect(await modules()).toEqual(["r", "s", "q", "p"]);
  });

  // The executor stamps the NOOP an UNDO becomes with its own clock.
  it("keeps an undo the reshuffle moves on the operation it undid", async () => {
    await build();
    await execute([moduleAction("x", -120_000)]);
    await execute([undo()]);
    expect(await modules()).toEqual([]);

    await load([asOperation(moduleAction("z", -90_000), 0)]);

    expect(await modules()).toEqual(["z"]);
    expect(await live()).toContain("z");
  });

  // A NOOP records no target: a reshuffle moving a peer's undo away from the
  // operation it undid leaves the skip on whatever sorts before it.
  it.fails("keeps a peer's undo on the operation it undid", async () => {
    await build();
    await load([asOperation(moduleAction("x", 0), 0)]);
    await execute([moduleAction("w", 20)]);
    const noop: Action = {
      id: "peer-undo",
      type: "NOOP",
      scope: "global",
      input: {},
      timestampUtcMs: new Date(base + 10).toISOString(),
    };

    await load([asOperation(noop, 1, 1)]);

    expect(await modules()).toEqual(["w"]);
  });
});
