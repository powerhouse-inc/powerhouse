import type {
  Action,
  DocumentModelDocument,
  Operation,
} from "@powerhousedao/shared/document-model";
import {
  addModule,
  deriveOperationId,
  positionalOperations,
} from "@powerhousedao/shared/document-model";
import { afterEach, describe, expect, it } from "vitest";
import type { InProcessReactorModule } from "../../src/core/types.js";
import { JobStatus, type JobInfo } from "../../src/shared/types.js";
import {
  createBaseReducer3Document,
  createUndoV3ReactorBuilder,
  undoV3Flags,
} from "../factories.js";
import { storedRows } from "./one-rule-agreement.js";

const LOW_ID = "00000000-0000-4000-8000-000000000000";
const MID_ID = "80000000-0000-4000-8000-000000000000";
const HIGH_ID = "ffffffff-ffff-4fff-bfff-ffffffffffff";

describe("base-reducer 3 timestamp ties", () => {
  const live: InProcessReactorModule[] = [];

  afterEach(() => {
    for (const module of live.splice(0)) module.reactor.kill();
  });

  async function build(maxSkipThreshold?: number) {
    const module = await createUndoV3ReactorBuilder()
      .withExecutorConfig({
        featureFlags: undoV3Flags({ documentDecisions: true }),
        ...(maxSkipThreshold === undefined ? {} : { maxSkipThreshold }),
      })
      .withWriteCacheConfig({ keyframeInterval: 2 })
      .buildModule();
    live.push(module);
    return module;
  }

  async function settle(
    module: InProcessReactorModule,
    job: JobInfo,
  ): Promise<JobInfo> {
    let status = await module.reactor.getJobStatus(job.id);
    while (
      status.status !== JobStatus.READ_READY &&
      status.status !== JobStatus.FAILED
    ) {
      await new Promise((resolve) => setTimeout(resolve, 5));
      status = await module.reactor.getJobStatus(job.id);
    }
    return status;
  }

  async function ok(module: InProcessReactorModule, job: JobInfo) {
    const settled = await settle(module, job);
    expect(settled.error?.message ?? settled.status).toBe(JobStatus.READ_READY);
  }

  const base = Date.now() + 60_000;
  const at = (name: string, ms: number, actionId?: string): Action => ({
    ...addModule({ id: name, name }),
    ...(actionId ? { id: actionId } : {}),
    timestampUtcMs: new Date(base + ms).toISOString(),
  });

  const row = (docId: string, action: Action, index: number): Operation => ({
    id: deriveOperationId(docId, action.scope, "main", action.id),
    index,
    skip: 0,
    hash: "",
    timestampUtcMs: action.timestampUtcMs,
    action,
  });

  async function shared(...modules: InProcessReactorModule[]) {
    const document = createBaseReducer3Document({ signaturePolicy: "legacy" });
    for (const module of modules) {
      await ok(module, await module.reactor.create(document));
    }
    return document.header.id;
  }

  async function view(module: InProcessReactorModule, docId: string) {
    const document = await module.reactor.get<DocumentModelDocument>(docId);
    return {
      positional: positionalOperations(await storedRows(module, docId)).map(
        (operation) => (operation.action.input as { id: string }).id,
      ),
      modules: document.state.global.specifications[0].modules.map(
        (entry) => entry.id,
      ),
    };
  }

  it("orders a tied local write after a stored row only when its action id sorts after", async () => {
    const module = await build();
    const docId = await shared(module);

    await ok(
      module,
      await module.reactor.execute(docId, "main", [at("p", 10, MID_ID)]),
    );
    await ok(
      module,
      await module.reactor.execute(docId, "main", [at("q", 10, LOW_ID)]),
    );
    expect((await view(module, docId)).positional).toEqual(["q", "p"]);

    // Sorts after the head, so it is appended without re-appending anything.
    const before = (await storedRows(module, docId)).length;
    await ok(
      module,
      await module.reactor.execute(docId, "main", [at("r", 10, HIGH_ID)]),
    );
    expect((await storedRows(module, docId)).length).toBe(before + 1);
    expect((await view(module, docId)).positional).toEqual(["q", "p", "r"]);
  });

  it("converges on a cross-peer tie after a sender-side reshuffle", async () => {
    const a = await build();
    const b = await build();
    const docId = await shared(a, b);

    // B: p, then a backdated q by load, so B's log is longer than A's.
    const p = at("p", 10);
    const q = at("q", 5);
    await ok(b, await b.reactor.execute(docId, "main", [p]));
    await ok(b, await b.reactor.load(docId, "main", [row(docId, q, 0)]));
    await ok(
      a,
      await a.reactor.load(docId, "main", [row(docId, q, 0), row(docId, p, 1)]),
    );
    const lengthA = (await storedRows(a, docId)).length;
    const lengthB = (await storedRows(b, docId)).length;

    // The same millisecond on both peers; B's action id sorts first.
    const fromA = at("a", 20, HIGH_ID);
    const fromB = at("b", 20, LOW_ID);
    await ok(a, await a.reactor.execute(docId, "main", [fromA]));
    await ok(b, await b.reactor.execute(docId, "main", [fromB]));

    await ok(
      a,
      await a.reactor.load(docId, "main", [row(docId, fromB, lengthB)]),
    );
    await ok(
      b,
      await b.reactor.load(docId, "main", [row(docId, fromA, lengthA)]),
    );

    // B's reshuffle echoes back to A.
    const echo = (await storedRows(b, docId)).filter(
      (operation) => operation.index > lengthB,
    );
    await ok(a, await a.reactor.load(docId, "main", echo));

    const order = ["q", "p", "b", "a"];
    const expected = { positional: order, modules: order };
    expect({ a: await view(a, docId), b: await view(b, docId) }).toEqual({
      a: expected,
      b: expected,
    });
  });

  it("converges on a same-job tie delivered after a later peer row", async () => {
    const a = await build();
    const b = await build();
    const docId = await shared(a, b);

    const c = at("c", 1);
    await ok(b, await b.reactor.execute(docId, "main", [c]));
    const a1 = at("a1", 0, HIGH_ID);
    const a2 = at("a2", 0, LOW_ID);
    await ok(a, await a.reactor.execute(docId, "main", [a1, a2]));

    // B's c reaches A first, then A's job reaches B.
    await ok(a, await a.reactor.load(docId, "main", [row(docId, c, 0)]));
    await ok(
      b,
      await b.reactor.load(docId, "main", [
        row(docId, a1, 0),
        row(docId, a2, 1),
      ]),
    );

    // B's reshuffle echoes back to A.
    const echo = (await storedRows(b, docId)).filter(
      (operation) => operation.index >= 1,
    );
    await ok(a, await a.reactor.load(docId, "main", echo));

    const order = ["a2", "a1", "c"];
    const expected = { positional: order, modules: order };
    expect({ a: await view(a, docId), b: await view(b, docId) }).toEqual({
      a: expected,
      b: expected,
    });
  });
});
