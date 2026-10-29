import type {
  Action,
  DocumentModelDocument,
  Operation,
} from "@powerhousedao/shared/document-model";
import {
  addModule,
  deriveOperationId,
  garbageCollect,
  garbageCollectV2,
  redo,
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
import type { PHDocument } from "@powerhousedao/shared/document-model";
import {
  appliedOperations,
  retract,
  retractionTarget,
} from "@powerhousedao/shared/document-model";
import {
  createBaseReducer3Document,
  createUndoV3ReactorBuilder,
} from "../factories.js";
import { assertOneRuleAgreement, storedRows } from "./one-rule-agreement.js";

/** The executor, decision walk and positioned writes: `garbageCollect`. */
function byGarbageCollect(stream: Operation[]): Operation[] {
  return garbageCollect(sortOperations(stream));
}

/** `processSkipOperation`: each skip prunes the history seen so far. */
function bySequentialPruning(stream: Operation[]): Operation[] {
  let history: Operation[] = [];
  for (const operation of sortOperations(stream)) {
    history = [...history, operation];
    if (operation.skip > 0) {
      history = garbageCollect(sortOperations(history));
    }
  }
  return history;
}

/** `garbageCollectV2`: each NOOP marker in a chain retracts one operation. */
function byNoopChains(stream: Operation[]): Operation[] {
  return garbageCollectV2(sortOperations(stream));
}

function moduleIds(operations: Operation[]): string[] {
  return operations
    .filter((operation) => operation.action.type !== "NOOP")
    .map((operation) => (operation.action.input as { id: string }).id);
}

function shape(stream: Operation[]): string {
  return stream
    .map((operation) => {
      const label =
        operation.action.type === "NOOP"
          ? "NOOP"
          : (operation.action.input as { id: string }).id;
      return `${operation.index}:${label}/${operation.skip}`;
    })
    .join(" ");
}

interface Rules {
  stream: string;
  garbageCollect: string[];
  sequentialPruning: string[];
  noopChains: string[];
  live: string[];
  rebuilt: string[];
}

describe("base-reducer 2", () => {
  describe("effective-operation rules on executor-produced streams", () => {
    let module: InProcessReactorModule | undefined;
    let docId: string;

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
      const document = createDocModelDocument({
        signaturePolicy: "legacy",
        protocolVersions: { "base-reducer": 2 },
      });
      docId = document.header.id;
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

    /** Stamped ten minutes back, so it sorts before everything local. */
    function early(id: string, offsetMs = 0): Action {
      return {
        ...addModule({ id, name: id }),
        timestampUtcMs: new Date(Date.now() - 600_000 + offsetMs).toISOString(),
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
      const document = await module!.reactor.get<DocumentModelDocument>(docId);
      return document.state.global.specifications[0].modules.map(
        (entry) => entry.id,
      );
    }

    /** A cold write-cache rebuild from the operation store. */
    async function rebuilt(): Promise<string[]> {
      module!.writeCache.invalidate(docId);
      const document = (await module!.writeCache.getState(
        docId,
        "global",
        "main",
      )) as DocumentModelDocument;
      return document.state.global.specifications[0].modules.map(
        (entry) => entry.id,
      );
    }

    async function rules(): Promise<Rules> {
      const stream = await stored();
      return {
        stream: shape(stream),
        garbageCollect: moduleIds(byGarbageCollect(stream)),
        sequentialPruning: moduleIds(bySequentialPruning(stream)),
        noopChains: moduleIds(byNoopChains(stream)),
        live: await live(),
        rebuilt: await rebuilt(),
      };
    }

    async function twoUndos(): Promise<void> {
      await add("a");
      await add("b");
      await execute([undo()]);
      await execute([undo()]);
    }

    describe("(i) two consecutive UNDOs", () => {
      it("live state and a cold rebuild both follow the NOOP chains", async () => {
        await build();
        await twoUndos();

        const result = await rules();
        expect(result.stream).toBe("0:a/0 1:b/0 2:NOOP/1 3:NOOP/1");
        expect(result.noopChains).toEqual([]);
        expect(result.live).toEqual([]);
        expect(result.rebuilt).toEqual([]);
      });

      // garbageCollect keeps [a, b]; the NOOP chains keep [].
      it.fails("garbageCollect agrees with the NOOP chains", async () => {
        await build();
        await twoUndos();

        const result = await rules();
        expect(result.garbageCollect).toEqual(result.noopChains);
      });

      // Sequential pruning keeps [a]; the NOOP chains keep [].
      it.fails("sequential pruning agrees with the NOOP chains", async () => {
        await build();
        await twoUndos();

        const result = await rules();
        expect(result.sequentialPruning).toEqual(result.noopChains);
      });

      // selectLoadWrites reads a as live, re-appends it and zeroes the NOOP.
      it.fails("keeps both undone across a load reshuffle", async () => {
        await build();
        await twoUndos();

        await load([asOperation(early("z"), 0)]);

        expect(await live()).toEqual(["z"]);
      });

      // positionByTimestamp re-appends garbageCollect's set, which keeps a, b.
      it.fails("keeps both undone across a backdated execute", async () => {
        await build({ documentDecisions: true });
        await twoUndos();

        await execute([early("z")]);

        expect(await live()).toEqual(["z"]);
      });
    });

    describe("(ii) UNDO, REDO, UNDO", () => {
      it("is unreachable: REDO is refused once the stream holds a NOOP marker", async () => {
        await build();
        await add("a");
        await add("b");
        await execute([undo()]);

        expect(await tryExecute([redo()])).toContain(
          "Cannot redo: no operations in the clipboard",
        );
      });

      it("gives one effective set when the undone action is executed again", async () => {
        await build();
        await add("a");
        await add("b");
        await execute([undo()]);
        await add("b2");
        await execute([undo()]);

        const result = await rules();
        expect(result.stream).toBe("0:a/0 1:b/0 2:NOOP/1 3:b2/0 4:NOOP/1");
        expect(result.garbageCollect).toEqual(["a"]);
        expect(result.sequentialPruning).toEqual(["a"]);
        expect(result.noopChains).toEqual(["a"]);
        expect(result.live).toEqual(["a"]);
        expect(result.rebuilt).toEqual(["a"]);
      });
    });

    describe("(iii) an UNDO after a reshuffle re-appended a local NOOP", () => {
      async function reshuffledUndo(): Promise<void> {
        await execute([early("m0", 60_000)]);
        await execute([undo()]);
        await load([asOperation(early("m1"), 0)]);
      }

      async function reshuffledUndoOverTwo(): Promise<void> {
        await execute([early("m0", 60_000)]);
        await execute([early("mx", 60_010)]);
        await execute([undo()]);
        await load([asOperation(early("m1"), 0)]);
      }

      it("gives one effective set after the reshuffle", async () => {
        await build();
        await reshuffledUndo();

        const result = await rules();
        expect(result.stream).toBe("0:m0/0 1:NOOP/1 2:m1/2 3:NOOP/0");
        expect(result.garbageCollect).toEqual(["m1"]);
        expect(result.sequentialPruning).toEqual(["m1"]);
        expect(result.noopChains).toEqual(["m1"]);
        expect(result.live).toEqual(["m1"]);
        expect(result.rebuilt).toEqual(["m1"]);
      });

      // undoOperationV2 counts the skip-0 NOOP as an undo; garbageCollectV2 not.
      it.fails("undoes the operation the reshuffle left live", async () => {
        await build();
        await reshuffledUndo();

        await execute([undo()]);

        expect(await live()).toEqual([]);
      });

      it("gives one effective set when the later UNDO is accepted", async () => {
        await build();
        await reshuffledUndoOverTwo();
        expect(shape(await stored())).toBe(
          "0:m0/0 1:mx/0 2:NOOP/1 3:m1/3 4:m0/0 5:NOOP/0",
        );

        await execute([undo()]);

        const result = await rules();
        expect(result.stream).toBe(
          "0:m0/0 1:mx/0 2:NOOP/1 3:m1/3 4:m0/0 5:NOOP/0 6:NOOP/1",
        );
        expect(result.garbageCollect).toEqual(["m1", "m0"]);
        expect(result.sequentialPruning).toEqual(["m1", "m0"]);
        expect(result.live).toEqual(["m1", "m0"]);
        expect(result.rebuilt).toEqual(["m1", "m0"]);
      });

      // Every rule spends the new marker on the skip-0 NOOP: a no-op UNDO.
      it.fails("changes the state when the later UNDO is accepted", async () => {
        await build();
        await reshuffledUndoOverTwo();

        await execute([undo()]);

        expect(await live()).toEqual(["m1"]);
      });
    });

    describe("(iv) other reshuffles the executor produces", () => {
      async function contentHeaded(): Promise<void> {
        await add("x");
        await load([asOperation(early("z"), 0)]);
      }

      async function noopHeaded(): Promise<void> {
        await add("m0");
        await add("m1");
        const peerUndo: Action = {
          id: "peer-undo",
          type: "NOOP",
          scope: "global",
          input: {},
          timestampUtcMs: new Date(Date.now() - 600_000).toISOString(),
        };
        await load([asOperation(peerUndo, 0, 1)]);
      }

      it("a content-headed reshuffle: live state and a cold rebuild follow garbageCollect", async () => {
        await build();
        await contentHeaded();

        const result = await rules();
        expect(result.stream).toBe("0:x/0 1:z/1 2:x/0");
        expect(result.garbageCollect).toEqual(["z", "x"]);
        expect(result.sequentialPruning).toEqual(["z", "x"]);
        expect(result.live).toEqual(["z", "x"]);
        expect(result.rebuilt).toEqual(["z", "x"]);
      });

      // garbageCollectV2 ignores a non-NOOP head's skip: rewound x stays.
      it.fails("a content-headed reshuffle: the NOOP chains agree", async () => {
        await build();
        await contentHeaded();

        const result = await rules();
        expect(result.noopChains).toEqual(result.garbageCollect);
      });

      it("a NOOP-headed reshuffle: live state and a cold rebuild agree", async () => {
        await build();
        await noopHeaded();

        const result = await rules();
        expect(result.stream).toBe("0:m0/0 1:m1/0 2:NOOP/2 3:m0/0 4:m1/0");
        expect(result.garbageCollect).toEqual(["m0", "m1"]);
        expect(result.sequentialPruning).toEqual(["m0", "m1"]);
        expect(result.live).toEqual(["m0", "m1"]);
        expect(result.rebuilt).toEqual(["m0", "m1"]);
      });

      // garbageCollectV2 reads the head NOOP's skip 2 as 1: rewound m0 stays.
      it.fails("a NOOP-headed reshuffle: the NOOP chains agree", async () => {
        await build();
        await noopHeaded();

        const result = await rules();
        expect(result.noopChains).toEqual(result.garbageCollect);
      });

      // So the re-appended m0 is reduced onto a state still holding m0.
      it.fails("a NOOP-headed reshuffle: re-appends without error", async () => {
        await build();
        await noopHeaded();

        const errors = (await stored())
          .filter((operation) => operation.error)
          .map((operation) => `${operation.index}: ${operation.error}`);
        expect(errors).toEqual([]);
      });
    });
  });
});

/** A RETRACT is labelled by what it names, so `RETRACT(b)` retracts module b. */
function shapeV3(stream: Operation[]): string {
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

function addedModules(operations: Operation[]): string[] {
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

    async function build(
      featureFlags: Partial<ReactorFeatureFlags> = {},
    ): Promise<void> {
      module = await createUndoV3ReactorBuilder({ featureFlags })
        .withWriteCacheConfig({ keyframeInterval: 2 })
        .buildModule();
      document = createBaseReducer3Document({ signaturePolicy: "legacy" });
      docId = document.header.id;
      const created = await settle(await module.reactor.create(document));
      expect(created.error?.message ?? created.status).toBe(
        JobStatus.READ_READY,
      );
      expect(
        (await module.reactor.get(docId)).header.protocolVersions?.[
          "base-reducer"
        ],
      ).toBe(3);
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

    /** Stamped ten minutes back, so it sorts before everything local. */
    function early(action: Action, offsetMs = 0): Action {
      return {
        ...action,
        timestampUtcMs: new Date(Date.now() - 600_000 + offsetMs).toISOString(),
      };
    }

    function earlyModule(id: string, offsetMs = 0): Action {
      return early(addModule({ id, name: id }), offsetMs);
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

    /** What IReactorClient.undo submits: a RETRACT of the resolved target. */
    async function undoNow(): Promise<void> {
      const { undoTarget } = await module!.reactor.resolveUndoRedo(
        docId,
        "global",
        "main",
      );
      expect(undoTarget).toBeDefined();
      await execute([retract(undoTarget!)]);
    }

    async function add(id: string): Promise<Action> {
      const action = addModule({ id, name: id });
      await execute([action]);
      return action;
    }

    async function load(operations: Operation[]): Promise<void> {
      const job = await settle(
        await module!.reactor.load(docId, "main", operations),
      );
      expect(job.error?.message ?? job.status).toBe(JobStatus.READ_READY);
    }

    async function stored(): Promise<Operation[]> {
      return storedRows(module!, docId);
    }

    async function live(): Promise<string[]> {
      const served = await module!.reactor.get<DocumentModelDocument>(docId);
      return served.state.global.specifications[0].modules.map(
        (entry) => entry.id,
      );
    }

    async function agree(): Promise<void> {
      await assertOneRuleAgreement({ module: module!, document });
    }

    async function twoUndos(): Promise<void> {
      await add("a");
      await add("b");
      await undoNow();
      await undoNow();
    }

    describe("(i) two consecutive UNDOs", () => {
      it("keeps both undone across a load reshuffle", async () => {
        await build();
        await twoUndos();

        await load([asOperation(earlyModule("z"), 0)]);

        expect(shapeV3(await stored())).toBe(
          "0:a/0 1:b/0 2:RETRACT(b)/0 3:RETRACT(a)/0 4:z/4 5:a/0 6:b/0 7:RETRACT(b)/0 8:RETRACT(a)/0",
        );
        expect(await live()).toEqual(["z"]);
        await agree();
      });

      it("keeps both undone across a backdated execute", async () => {
        await build({ documentDecisions: true });
        await twoUndos();

        await execute([earlyModule("z")]);

        expect(shapeV3(await stored())).toBe(
          "0:a/0 1:b/0 2:RETRACT(b)/0 3:RETRACT(a)/0 4:z/4 5:a/0 6:b/0 7:RETRACT(b)/0 8:RETRACT(a)/0",
        );
        expect(await live()).toEqual(["z"]);
        await agree();
      });
    });

    describe("(iii) an UNDO after a reshuffle re-appended a local RETRACT", () => {
      async function reshuffledUndo(): Promise<void> {
        await execute([earlyModule("m0", 60_000)]);
        await undoNow();
        await load([asOperation(earlyModule("m1"), 0)]);
      }

      async function reshuffledUndoOverTwo(): Promise<void> {
        await execute([earlyModule("m0", 60_000)]);
        await execute([earlyModule("mx", 60_010)]);
        await undoNow();
        await load([asOperation(earlyModule("m1"), 0)]);
      }

      it("undoes the operation the reshuffle left live", async () => {
        await build();
        await reshuffledUndo();
        expect(shapeV3(await stored())).toBe(
          "0:m0/0 1:RETRACT(m0)/0 2:m1/2 3:m0/0 4:RETRACT(m0)/0",
        );
        expect(await live()).toEqual(["m1"]);

        await undoNow();

        expect(await live()).toEqual([]);
        await agree();
      });

      it("changes the state when the later UNDO is accepted", async () => {
        await build();
        await reshuffledUndoOverTwo();
        expect(shapeV3(await stored())).toBe(
          "0:m0/0 1:mx/0 2:RETRACT(mx)/0 3:m1/3 4:m0/0 5:mx/0 6:RETRACT(mx)/0",
        );
        expect(await live()).toEqual(["m1", "m0"]);

        await undoNow();

        expect(await live()).toEqual(["m1"]);
        await agree();
      });
    });

    describe("(iv) other reshuffles the executor produces", () => {
      async function contentHeaded(): Promise<void> {
        await add("x");
        await load([asOperation(earlyModule("z"), 0)]);
      }

      // A plain no-op from a peer; the sender's skip of 1 is not read.
      async function noopHeaded(): Promise<void> {
        await add("m0");
        await add("m1");
        const peerNoop: Action = early({
          id: "peer-noop",
          type: "NOOP",
          scope: "global",
          input: {},
          timestampUtcMs: "",
        });
        await load([asOperation(peerNoop, 0, 1)]);
      }

      async function retractHeaded(): Promise<void> {
        await add("m0");
        const m1 = await add("m1");
        await load([asOperation(early(retract(m1.id)), 0)]);
      }

      it("a content-headed reshuffle: the retraction rule agrees with garbageCollect", async () => {
        await build();
        await contentHeaded();

        const stream = await stored();
        expect(shapeV3(stream)).toBe("0:x/0 1:z/1 2:x/0");
        expect(addedModules(appliedOperations(stream))).toEqual(
          addedModules(garbageCollect(sortOperations(stream))),
        );
        expect(await live()).toEqual(["z", "x"]);
        await agree();
      });

      it("a NOOP-headed reshuffle: the retraction rule agrees with garbageCollect", async () => {
        await build();
        await noopHeaded();

        const stream = await stored();
        expect(shapeV3(stream)).toBe("0:m0/0 1:m1/0 2:NOOP/2 3:m0/0 4:m1/0");
        expect(addedModules(appliedOperations(stream))).toEqual(
          addedModules(garbageCollect(sortOperations(stream))),
        );
        expect(await live()).toEqual(["m0", "m1"]);
        await agree();
      });

      it("a NOOP-headed reshuffle: re-appends without error", async () => {
        await build();
        await noopHeaded();

        const errors = (await stored())
          .filter((operation) => operation.error)
          .map((operation) => `${operation.index}: ${operation.error}`);
        expect(errors).toEqual([]);
        await agree();
      });

      it("a RETRACT-headed reshuffle: the retraction rule agrees with garbageCollect", async () => {
        await build();
        await retractHeaded();

        const stream = await stored();
        expect(shapeV3(stream)).toBe(
          "0:m0/0 1:m1/0 2:RETRACT(m1)/2 3:m0/0 4:m1/0",
        );
        expect(addedModules(garbageCollect(sortOperations(stream)))).toEqual([
          "m0",
          "m1",
        ]);
        expect(addedModules(appliedOperations(stream))).toEqual(["m0"]);
        expect(await live()).toEqual(["m0"]);
        await agree();
      });

      it("a RETRACT-headed reshuffle: re-appends without error", async () => {
        await build();
        await retractHeaded();

        const errors = (await stored())
          .filter((operation) => operation.error)
          .map((operation) => `${operation.index}: ${operation.error}`);
        expect(errors).toEqual([]);
        await agree();
      });
    });
  });
});
