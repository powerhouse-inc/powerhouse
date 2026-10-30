import type {
  DocumentModelDocument,
  Operation,
} from "@powerhousedao/shared/document-model";
import {
  addModule,
  garbageCollect,
  sortOperations,
  undo,
} from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReactorBuilder } from "../../src/core/reactor-builder.js";
import type { IReactor } from "../../src/core/types.js";
import { JobStatus, type JobInfo } from "../../src/shared/types.js";
import { createDocModelDocument } from "../factories.js";
import type { PHDocument } from "@powerhousedao/shared/document-model";
import {
  appliedOperations,
  retractionTarget,
} from "@powerhousedao/shared/document-model";
import type { InProcessReactorModule } from "../../src/core/types.js";
import {
  authorRetraction,
  createBaseReducer3Document,
  createUndoV3ReactorBuilder,
} from "../factories.js";
import { assertOneRuleAgreement } from "./one-rule-agreement.js";

// An unseen local row stamped before the incoming undo is no conflict.
describe("a peer's undo on the append path", () => {
  let undoing: IReactor;
  let receiving: IReactor;
  let docId: string;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    undoing = await build();
    receiving = await build();
    const document = createDocModelDocument({ id: "append-undo" });
    docId = document.header.id;
    await ok(undoing, await undoing.create(document));
    await ok(receiving, await receiving.create(document));
  });

  afterEach(() => {
    undoing?.kill();
    receiving?.kill();
    vi.useRealTimers();
  });

  async function build(): Promise<IReactor> {
    return new ReactorBuilder()
      .withDocumentModelSources([documentModelDocumentModelModule as never])
      .build();
  }

  async function ok(reactor: IReactor, job: JobInfo): Promise<void> {
    await vi.waitUntil(async () => {
      const status = await reactor.getJobStatus(job.id);
      return (
        status.status === JobStatus.FAILED ||
        status.status === JobStatus.READ_READY
      );
    });
    const status = await reactor.getJobStatus(job.id);
    expect(status.error?.message ?? status.status).toBe(JobStatus.READ_READY);
  }

  async function globalOps(reactor: IReactor): Promise<Operation[]> {
    const result = (await reactor.getOperations(docId, {
      branch: "main",
      scopes: ["global"],
    })) as Record<string, { results: Operation[] } | undefined>;
    return result.global?.results ?? [];
  }

  async function live(reactor: IReactor): Promise<string[]> {
    return garbageCollect(sortOperations(await globalOps(reactor)))
      .filter((operation) => operation.action.type !== "NOOP")
      .map((operation) => (operation.action.input as { id: string }).id);
  }

  async function modules(reactor: IReactor): Promise<string[]> {
    const document = await reactor.get<DocumentModelDocument>(docId);
    return document.state.global.specifications[0].modules.map(
      (entry) => entry.id,
    );
  }

  // The incoming NOOP's skip covers the row it lands after, not its target.
  it.fails("keeps a peer's undo on the operation it undid", async () => {
    vi.setSystemTime(new Date("2026-01-01T00:00:01.000Z"));
    await ok(
      undoing,
      await undoing.execute(docId, "main", [addModule({ id: "x", name: "x" })]),
    );
    await ok(
      receiving,
      await receiving.load(docId, "main", await globalOps(undoing)),
    );

    // Unseen by the undoing replica, and stamped before its undo.
    vi.setSystemTime(new Date("2026-01-01T00:00:02.000Z"));
    await ok(
      receiving,
      await receiving.execute(docId, "main", [
        addModule({ id: "l", name: "l" }),
      ]),
    );

    vi.setSystemTime(new Date("2026-01-01T00:00:03.000Z"));
    await ok(undoing, await undoing.execute(docId, "main", [undo()]));
    const undoingLog = await globalOps(undoing);
    const noop = undoingLog.find((op) => op.action.type === "NOOP")!;
    expect([noop.index, noop.skip]).toEqual([1, 1]);
    expect(await modules(undoing)).toEqual([]);

    await ok(receiving, await receiving.load(docId, "main", [noop]));

    expect(await live(receiving)).toEqual(["l"]);
    expect(await modules(receiving)).toEqual(["l"]);
  });
});

describe("base-reducer 3", () => {
  describe("a peer's undo on the append path", () => {
    let undoing: InProcessReactorModule;
    let receiving: InProcessReactorModule;
    let document: PHDocument;
    let docId: string;

    beforeEach(async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
      undoing = await build();
      receiving = await build();
      document = createBaseReducer3Document({ id: "append-undo-v3" });
      docId = document.header.id;
      await ok(undoing.reactor, await undoing.reactor.create(document));
      await ok(receiving.reactor, await receiving.reactor.create(document));
      for (const replica of [undoing, receiving]) {
        expect(
          (await replica.reactor.get(docId)).header.protocolVersions?.[
            "base-reducer"
          ],
        ).toBe(3);
      }
    });

    afterEach(() => {
      undoing.reactor.kill();
      receiving.reactor.kill();
      vi.useRealTimers();
    });

    async function build(): Promise<InProcessReactorModule> {
      return createUndoV3ReactorBuilder()
        .withWriteCacheConfig({ keyframeInterval: 2 })
        .buildModule();
    }

    async function ok(reactor: IReactor, job: JobInfo): Promise<void> {
      await vi.waitUntil(async () => {
        const status = await reactor.getJobStatus(job.id);
        return (
          status.status === JobStatus.FAILED ||
          status.status === JobStatus.READ_READY
        );
      });
      const status = await reactor.getJobStatus(job.id);
      expect(status.error?.message ?? status.status).toBe(JobStatus.READ_READY);
    }

    async function globalOps(reactor: IReactor): Promise<Operation[]> {
      const result = (await reactor.getOperations(docId, {
        branch: "main",
        scopes: ["global"],
      })) as Record<string, { results: Operation[] } | undefined>;
      return result.global?.results ?? [];
    }

    async function live(reactor: IReactor): Promise<string[]> {
      return appliedOperations(await globalOps(reactor)).map(
        (operation) => (operation.action.input as { id: string }).id,
      );
    }

    async function modules(reactor: IReactor): Promise<string[]> {
      const served = await reactor.get<DocumentModelDocument>(docId);
      return served.state.global.specifications[0].modules.map(
        (entry) => entry.id,
      );
    }

    // The RETRACT names x, whatever row it lands after.
    it("keeps a peer's undo on the operation it undid", async () => {
      vi.setSystemTime(new Date("2026-01-01T00:00:01.000Z"));
      await ok(
        undoing.reactor,
        await undoing.reactor.execute(docId, "main", [
          addModule({ id: "x", name: "x" }),
        ]),
      );
      await ok(
        receiving.reactor,
        await receiving.reactor.load(
          docId,
          "main",
          await globalOps(undoing.reactor),
        ),
      );

      // Unseen by the undoing replica, and stamped before its undo.
      vi.setSystemTime(new Date("2026-01-01T00:00:02.000Z"));
      await ok(
        receiving.reactor,
        await receiving.reactor.execute(docId, "main", [
          addModule({ id: "l", name: "l" }),
        ]),
      );

      vi.setSystemTime(new Date("2026-01-01T00:00:03.000Z"));
      await ok(
        undoing.reactor,
        await undoing.reactor.execute(docId, "main", [
          await authorRetraction(undoing.reactor, docId),
        ]),
      );
      const undoingLog = await globalOps(undoing.reactor);
      const retraction = undoingLog.find(
        (operation) => retractionTarget(operation) !== undefined,
      )!;
      expect(retractionTarget(retraction)).toBe(undoingLog[0].action.id);
      expect([retraction.index, retraction.skip]).toEqual([1, 0]);
      expect(await modules(undoing.reactor)).toEqual([]);

      await ok(
        receiving.reactor,
        await receiving.reactor.load(docId, "main", [retraction]),
      );

      const receivingLog = await globalOps(receiving.reactor);
      expect(
        receivingLog.map((operation) => [operation.index, operation.skip]),
      ).toEqual([
        [0, 0],
        [1, 0],
        [2, 0],
      ]);
      expect(await live(receiving.reactor)).toEqual(["l"]);
      expect(await modules(receiving.reactor)).toEqual(["l"]);
      await assertOneRuleAgreement({ module: receiving, document });
      // Two rows: short of the first keyframe.
      await assertOneRuleAgreement({
        module: undoing,
        document,
        expectKeyframe: false,
      });
    });
  });
});
