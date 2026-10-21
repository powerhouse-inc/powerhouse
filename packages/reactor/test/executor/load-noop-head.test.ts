import type {
  Action,
  DocumentModelDocument,
  Operation,
  PHDocument,
} from "@powerhousedao/shared/document-model";
import {
  addModule,
  appliedOperations,
  baseReducerVersion,
  deriveOperationId,
  garbageCollect,
  retractionTarget,
  sortOperations,
  undo,
} from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { afterEach, describe, expect, it } from "vitest";
import { ReactorBuilder } from "../../src/core/reactor-builder.js";
import type { InProcessReactorModule } from "../../src/core/types.js";
import { JobStatus, type JobInfo } from "../../src/shared/types.js";
import {
  authorRetraction,
  createBaseReducer3Document,
  createDocModelDocument,
  createUndoV3ReactorBuilder,
} from "../factories.js";
import { assertOneRuleAgreement, storedRows } from "./one-rule-agreement.js";

/** A RETRACT is labelled by what it names, so `RETRACT(y)` retracts module y. */
function shape(stream: Operation[]): string {
  const byId = new Map(
    stream.map((operation) => [operation.action.id, operation]),
  );
  const label = (operation: Operation | undefined): string => {
    if (operation === undefined) return "?";
    const target = retractionTarget(operation);
    if (target !== undefined) return `RETRACT(${label(byId.get(target))})`;
    if (operation.action.type === "NOOP") return "NOOP";
    return (operation.action.input as { id: string }).id;
  };
  return stream
    .map(
      (operation) => `${operation.index}:${label(operation)}/${operation.skip}`,
    )
    .join(" ");
}

describe("base-reducer 2", () => {
  describe("a reshuffle headed by a local NOOP", () => {
    let module: InProcessReactorModule | undefined;

    afterEach(() => {
      module?.reactor.kill();
      module = undefined;
    });

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

    function ids(document: PHDocument): string[] {
      return (
        document as DocumentModelDocument
      ).state.global.specifications[0].modules.map((entry) => entry.id);
    }

    // Bug: the v2 reducer reads a reshuffle-head NOOP's skip as a one-op undo.
    it.fails("derives the same state on every path as the live op set", async () => {
      module = await new ReactorBuilder()
        .withDocumentModelSources([documentModelDocumentModelModule as never])
        .buildModule();
      const created = createDocModelDocument({
        signaturePolicy: "legacy",
        protocolVersions: { "base-reducer": 2 },
      });
      const docId = created.header.id;
      const job = await settle(await module.reactor.create(created));
      expect(job.error?.message ?? job.status).toBe(JobStatus.READ_READY);

      // The UNDO's NOOP is stamped with the executor clock, about base - 60s.
      const base = Date.now() + 60_000;
      const at = (id: string, offsetMs: number): Action => ({
        ...addModule({ id, name: id }),
        timestampUtcMs: new Date(base + offsetMs).toISOString(),
      });
      const execute = async (actions: Action[]) => {
        const executed = await settle(
          await module!.reactor.execute(docId, "main", actions),
        );
        expect(executed.error?.message ?? executed.status).toBe(
          JobStatus.READ_READY,
        );
      };

      await execute([at("x", -20_000)]);
      await execute([at("w", -10_000)]);
      await execute([at("y", -120_000)]);
      await execute([undo()]);
      expect(ids(await module.reactor.get(docId))).toEqual(["x", "w"]);

      // The rewind reaches the live NOOP, which sorts first and takes skip 4.
      const z = at("z", -30_000);
      const loaded = await settle(
        await module.reactor.load(docId, "main", [
          {
            id: deriveOperationId(docId, "global", "main", z.id),
            index: 0,
            skip: 0,
            hash: "",
            timestampUtcMs: z.timestampUtcMs,
            action: z,
          },
        ]),
      );
      expect(loaded.error?.message ?? loaded.status).toBe(JobStatus.READ_READY);

      const result = (await module.reactor.getOperations(docId, {
        branch: "main",
        scopes: ["global"],
      })) as Record<string, { results: Operation[] } | undefined>;
      const stored = result.global?.results ?? [];
      const head = stored[4];
      expect(head.action.type).toBe("NOOP");
      expect(head.skip).toBe(4);

      const intended = garbageCollect(sortOperations(stored))
        .filter((operation) => operation.action.type !== "NOOP")
        .map((operation) => (operation.action.input as { id: string }).id);
      expect(intended).toEqual(["z", "x", "w"]);

      // The executor's result, as the document view serves it.
      const served = ids(await module.reactor.get(docId));

      // A cold rebuild from storage.
      module.writeCache.invalidate(docId, "global", "main");
      const rebuilt = ids(
        await module.writeCache.getState(docId, "global", "main"),
      );

      // The reducer applied to the stored stream.
      let replayed: PHDocument = created;
      for (const operation of stored) {
        replayed = documentModelDocumentModelModule.reducer(
          replayed as never,
          operation.action,
          undefined,
          {
            skip: operation.skip,
            protocolVersion: baseReducerVersion(created.header),
            replayOptions: { operation },
            skipIndexValidation: true,
          },
        );
      }

      expect({
        served,
        rebuilt,
        replayed: ids(replayed),
        errors: stored.flatMap((operation) => operation.error ?? []),
      }).toEqual({
        served: intended,
        rebuilt: intended,
        replayed: intended,
        errors: [],
      });
    });
  });
});

describe("base-reducer 3", () => {
  describe("a reshuffle headed by a local RETRACT", () => {
    let module: InProcessReactorModule | undefined;

    afterEach(() => {
      module?.reactor.kill();
      module = undefined;
    });

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

    function ids(document: PHDocument): string[] {
      return (
        document as DocumentModelDocument
      ).state.global.specifications[0].modules.map((entry) => entry.id);
    }

    it("derives the same state on every path as the live op set", async () => {
      module = await createUndoV3ReactorBuilder()
        .withWriteCacheConfig({ keyframeInterval: 2 })
        .buildModule();
      const created = createBaseReducer3Document({ signaturePolicy: "legacy" });
      const docId = created.header.id;
      const job = await settle(await module.reactor.create(created));
      expect(job.error?.message ?? job.status).toBe(JobStatus.READ_READY);

      // The UNDO's RETRACT is stamped with the executor clock, about base - 60s.
      const base = Date.now() + 60_000;
      const at = (id: string, offsetMs: number): Action => ({
        ...addModule({ id, name: id }),
        timestampUtcMs: new Date(base + offsetMs).toISOString(),
      });
      const execute = async (actions: Action[]) => {
        const executed = await settle(
          await module!.reactor.execute(docId, "main", actions),
        );
        expect(executed.error?.message ?? executed.status).toBe(
          JobStatus.READ_READY,
        );
      };

      await execute([at("x", -20_000)]);
      await execute([at("w", -10_000)]);
      // Backdated, so the executor positions it ahead of x and w.
      await execute([at("y", -50_000)]);
      // Stamped before every row, so the local RETRACT heads its reshuffle.
      await execute([await authorRetraction(module!.reactor, docId)]);
      expect(ids(await module.reactor.get(docId))).toEqual(["y", "x"]);

      const z = at("z", -30_000);
      const loaded = await settle(
        await module.reactor.load(docId, "main", [
          {
            id: deriveOperationId(docId, "global", "main", z.id),
            index: 0,
            skip: 0,
            hash: "",
            timestampUtcMs: z.timestampUtcMs,
            action: z,
          },
        ]),
      );
      expect(loaded.error?.message ?? loaded.status).toBe(JobStatus.READ_READY);

      const stored = await storedRows(module, docId);
      expect(shape(stored)).toBe(
        "0:x/0 1:w/0 2:y/2 3:x/0 4:w/0 5:RETRACT(w)/5 6:y/0 7:x/0 8:w/0 9:z/2 10:x/0 11:w/0",
      );
      const intended = appliedOperations(stored).map(
        (operation) => (operation.action.input as { id: string }).id,
      );
      expect(intended).toEqual(["y", "z", "x"]);
      await assertOneRuleAgreement({ module, document: created });
    });
  });
});
