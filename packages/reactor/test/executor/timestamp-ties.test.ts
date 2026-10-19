import {
  driveDocumentModelModule,
  type DocumentDriveDocument,
} from "@powerhousedao/shared/document-drive";
import type {
  Action,
  DocumentModelDocument,
  Operation,
} from "@powerhousedao/shared/document-model";
import {
  addModule,
  deriveOperationId,
  positionalOperations,
  undo,
  withSignaturePolicy,
} from "@powerhousedao/shared/document-model";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { InProcessReactorModule } from "../../src/core/types.js";
import { synthesizedActionId } from "../../src/executor/synthesized-signing.js";
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
    vi.useRealTimers();
    for (const module of live.splice(0)) module.reactor.kill();
  });

  async function build(maxSkipThreshold?: number) {
    const module = await createUndoV3ReactorBuilder({
      modules: [driveDocumentModelModule],
    })
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

  // Submitted ids on either side of the stored rows, with synthesized ids on
  // the other side.
  for (const [undoId, side] of [
    ["f0000030-0000-4000-8000-000000000000", "after"],
    ["00000000-0000-4000-8000-000000000002", "before"],
  ] as const) {
    it(`positions a tied UNDO by the id it is stored under, which sorts ${side}`, async () => {
      const b = "20000000-0000-4000-8000-000000000000";
      const c = "30000000-0000-4000-8000-000000000000";
      const synthesized = synthesizedActionId(undoId);
      expect(synthesized > c).toBe(side === "after");
      expect(synthesized < b).toBe(side === "before");

      const origin = await build();
      const replica = await build();
      const docId = await shared(origin, replica);

      await ok(
        origin,
        await origin.reactor.execute(docId, "main", [at("b", 10, b)]),
      );
      await ok(
        origin,
        await origin.reactor.execute(docId, "main", [at("c", 10, c)]),
      );
      await ok(
        replica,
        await replica.reactor.load(
          docId,
          "main",
          await storedRows(origin, docId),
        ),
      );

      const tiedUndo: Action = {
        ...undo(),
        id: undoId,
        timestampUtcMs: at("u", 10).timestampUtcMs,
      };
      await ok(origin, await origin.reactor.execute(docId, "main", [tiedUndo]));
      await ok(
        replica,
        await replica.reactor.load(
          docId,
          "main",
          await storedRows(origin, docId),
        ),
      );

      const labels = async (module: InProcessReactorModule) =>
        positionalOperations(await storedRows(module, docId)).map(
          (operation) =>
            operation.action.type === "RETRACT"
              ? operation.action.id
              : (operation.action.input as { id: string }).id,
        );
      const expected =
        side === "after" ? ["b", "c", synthesized] : [synthesized, "b", "c"];
      expect({
        origin: await labels(origin),
        replica: await labels(replica),
      }).toEqual({
        origin: expected,
        replica: expected,
      });
    });
  }

  async function replicate(
    origin: InProcessReactorModule,
    replica: InProcessReactorModule,
    docId: string,
  ) {
    await ok(
      replica,
      await replica.reactor.load(
        docId,
        "main",
        await storedRows(origin, docId),
      ),
    );
  }

  const types = async (module: InProcessReactorModule, docId: string) =>
    positionalOperations(await storedRows(module, docId)).map(
      (operation) => operation.action.type,
    );

  for (const jobs of ["one job", "two jobs"] as const) {
    it(`keeps one client's same-millisecond edit before its UNDO, in ${jobs}`, async () => {
      const origin = await build();
      const replica = await build();
      const docId = await shared(origin, replica);

      vi.useFakeTimers({ toFake: ["Date"] });
      const edit = addModule({ id: "e", name: "e" });
      const tiedUndo = undo();
      expect(tiedUndo.timestampUtcMs).toBe(edit.timestampUtcMs);
      if (jobs === "one job") {
        await ok(
          origin,
          await origin.reactor.execute(docId, "main", [edit, tiedUndo]),
        );
      } else {
        await ok(origin, await origin.reactor.execute(docId, "main", [edit]));
        await ok(
          origin,
          await origin.reactor.execute(docId, "main", [tiedUndo]),
        );
      }
      await replicate(origin, replica, docId);

      const expected = {
        types: ["ADD_MODULE", "RETRACT"],
        modules: [] as string[],
      };
      for (const module of [origin, replica]) {
        expect({
          types: await types(module, docId),
          modules: (await view(module, docId)).modules,
        }).toEqual(expected);
      }
    });
  }

  it("keeps one client's same-millisecond DELETE_NODE before its ADD_FOLDER", async () => {
    const origin = await build();
    const replica = await build();
    const drive = withSignaturePolicy(
      driveDocumentModelModule.utils.createDocument(),
      "legacy",
      { protocolVersions: { "base-reducer": 3 } },
    );
    const docId = drive.header.id;
    for (const module of [origin, replica]) {
      await ok(module, await module.reactor.create(drive));
    }
    const { addFolder, deleteNode } = driveDocumentModelModule.actions;
    await ok(
      origin,
      await origin.reactor.execute(docId, "main", [
        addFolder({ id: "f", name: "first", parentFolder: null }),
      ]),
    );

    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 1_000);
    await ok(
      origin,
      await origin.reactor.execute(docId, "main", [
        deleteNode({ id: "f" }),
        addFolder({ id: "f", name: "second", parentFolder: null }),
      ]),
    );
    await replicate(origin, replica, docId);

    const expected = {
      types: ["ADD_FOLDER", "DELETE_NODE", "ADD_FOLDER"],
      nodes: ["f:second"],
    };
    for (const module of [origin, replica]) {
      const document = await module.reactor.get<DocumentDriveDocument>(docId);
      expect({
        types: await types(module, docId),
        nodes: document.state.global.nodes.map(
          (node) => `${node.id}:${node.name}`,
        ),
      }).toEqual(expected);
    }
  });

  for (const senderIndex of [10, 0]) {
    it(`writes nothing for a re-delivered row with a long tail after it, sender index ${senderIndex}`, async () => {
      const module = await build(3);
      const docId = await shared(module);

      const first = at("s1", 100);
      await ok(module, await module.reactor.execute(docId, "main", [first]));
      for (const [i, ms] of [200, 300, 400, 500, 600].entries()) {
        await ok(
          module,
          await module.reactor.execute(docId, "main", [at(`r${i}`, ms)]),
        );
      }
      const before = (await storedRows(module, docId)).length;

      const loaded = await settle(
        module,
        await module.reactor.load(docId, "main", [
          row(docId, first, senderIndex),
        ]),
      );

      expect({
        outcome: loaded.error?.message ?? loaded.status,
        rows: (await storedRows(module, docId)).length,
      }).toEqual({ outcome: JobStatus.READ_READY, rows: before });
    });
  }
});
