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
    const document = createDocModelDocument({ signaturePolicy: "legacy" });
    docId = document.header.id;
    const created = await settle(await module.reactor.create(document));
    expect(created.error?.message ?? created.status).toBe(JobStatus.READ_READY);
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
