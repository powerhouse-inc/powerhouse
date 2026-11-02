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
  deriveScope,
  documentModelStateReducer,
  positionalOperations,
  retractionTarget,
} from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { afterEach, describe, expect, it } from "vitest";
import type { InProcessReactorModule } from "../../src/core/types.js";
import { JobStatus, type JobInfo } from "../../src/shared/types.js";
import {
  authorRetraction,
  createBaseReducer3Document,
  createUndoV3ReactorBuilder,
} from "../factories.js";
import { assertOneRuleAgreement, storedRows } from "./one-rule-agreement.js";

const reducerFor = () => documentModelStateReducer as never;

function modulesOf(document: PHDocument): string[] {
  return (
    document as DocumentModelDocument
  ).state.global.specifications[0].modules.map((entry) => entry.id);
}

/** A RETRACT is labelled by what it names, so `RETRACT(b)` retracts module b. */
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

function moduleIds(operations: Operation[]): string[] {
  return operations
    .filter((operation) => operation.action.type === "ADD_MODULE")
    .map((operation) => (operation.action.input as { id: string }).id);
}

describe("base-reducer 3", () => {
  describe("effective-operation rules on executor-produced streams", () => {
    let module: InProcessReactorModule | undefined;
    let document: PHDocument;
    let docId: string;

    afterEach(() => {
      module?.reactor.kill();
      module = undefined;
    });

    async function build(): Promise<void> {
      module = await createUndoV3ReactorBuilder()
        .withWriteCacheConfig({ keyframeInterval: 2 })
        .buildModule();
      // Legacy, as the v2 originals: reactor.execute submits unsigned actions.
      document = createBaseReducer3Document({ signaturePolicy: "legacy" });
      docId = document.header.id;
      expect(baseReducerVersion(document.header)).toBe(3);
      const created = await settle(await module.reactor.create(document));
      expect(created.error?.message ?? created.status).toBe(
        JobStatus.READ_READY,
      );
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

    async function tryExecute(actions: Action[]): Promise<string | undefined> {
      const job = await settle(
        await module!.reactor.execute(docId, "main", actions),
      );
      return job.status === JobStatus.FAILED
        ? (job.error?.message ?? "failed")
        : undefined;
    }

    async function execute(actions: Action[]): Promise<void> {
      expect(await tryExecute(actions)).toBeUndefined();
    }

    async function add(id: string): Promise<void> {
      await execute([addModule({ id, name: id })]);
    }

    async function live(): Promise<string[]> {
      return modulesOf(await module!.reactor.get<PHDocument>(docId));
    }

    async function twoUndos(): Promise<void> {
      await add("a");
      await add("b");
      await execute([await authorRetraction(module!.reactor, docId)]);
      await execute([await authorRetraction(module!.reactor, docId)]);
    }

    describe("(i) two consecutive UNDOs", () => {
      it("garbageCollect agrees with the retraction rule", async () => {
        await build();
        await twoUndos();

        const stream = await storedRows(module!, docId);
        expect({
          stream: shape(stream),
          positional: shape(positionalOperations(stream)),
          applied: moduleIds(appliedOperations(stream)),
          live: await live(),
        }).toEqual({
          stream: "0:a/0 1:b/0 2:RETRACT(b)/0 3:RETRACT(a)/0",
          positional: "0:a/0 1:b/0 2:RETRACT(b)/0 3:RETRACT(a)/0",
          applied: [],
          live: [],
        });
        await assertOneRuleAgreement({ module: module!, document });
      });

      it("sequential application agrees with the retraction rule", async () => {
        await build();
        await twoUndos();

        const stream = await storedRows(module!, docId);
        expect(shape(stream)).toBe("0:a/0 1:b/0 2:RETRACT(b)/0 3:RETRACT(a)/0");
        const initial: PHDocument = {
          ...document,
          operations: { ...document.operations, global: [] },
        };
        const sequential: string[][] = [];
        const derived: string[][] = [];
        let current = initial;
        for (let i = 0; i < stream.length; i++) {
          const operation = stream[i];
          current = documentModelDocumentModelModule.reducer(
            current as never,
            operation.action,
            undefined,
            {
              skip: operation.skip,
              protocolVersion: 3,
              replayOptions: { operation },
              skipIndexValidation: true,
            },
          );
          sequential.push(modulesOf(current));
          derived.push(
            modulesOf(
              deriveScope(initial, stream.slice(0, i + 1), reducerFor).document,
            ),
          );
        }
        expect(sequential).toEqual(derived);
        expect(derived).toEqual([["a"], ["a", "b"], ["a"], []]);
        await assertOneRuleAgreement({ module: module!, document });
      });
    });

    describe("(ii) UNDO, REDO, UNDO", () => {
      it("succeeds, and each step serves the state the rule derives", async () => {
        await build();
        await add("a");
        await add("b");

        const steps: Record<string, string[]> = {};
        await execute([await authorRetraction(module!.reactor, docId)]);
        steps.undo = await live();
        await execute([await authorRetraction(module!.reactor, docId, "REDO")]);
        steps.redo = await live();
        await execute([await authorRetraction(module!.reactor, docId)]);
        steps.undoAgain = await live();

        expect(steps).toEqual({
          undo: ["a"],
          redo: ["a", "b"],
          undoAgain: ["a"],
        });
        expect(shape(await storedRows(module!, docId))).toBe(
          "0:a/0 1:b/0 2:RETRACT(b)/0 3:RETRACT(RETRACT(b))/0 4:RETRACT(b)/0",
        );
        await assertOneRuleAgreement({ module: module!, document });
      });
    });
  });
});
