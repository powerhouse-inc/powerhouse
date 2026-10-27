import type {
  Action,
  Operation,
  PHBaseState,
  PHDocument,
  StateReducer,
} from "@powerhousedao/shared/document-model";
import {
  baseCreateDocument,
  deriveScope,
  redoTarget,
  retract,
  setModelName,
  undoTarget,
} from "@powerhousedao/shared/document-model";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactorClient } from "../../src/client/reactor-client.js";
import { ReactorClientBuilder } from "../../src/core/reactor-client-builder.js";
import type { InProcessReactorModule } from "../../src/core/types.js";
import {
  scopeDerivation,
  UndoTargetsCache,
  type DeriveScopeForTargets,
} from "../../src/derivation/index.js";
import { DocumentNotFoundError } from "../../src/shared/errors.js";
import type { IOperationStore } from "../../src/storage/interfaces.js";
import {
  createBaseReducer3Document,
  createUndoV3ReactorBuilder,
} from "../factories.js";

type ListState = PHBaseState & {
  global: { items: string[] };
  local: Record<string, never>;
};

const listReducer: StateReducer<ListState> = (state, action) => {
  if (action.type === "PUSH") {
    state.global.items.push(action.id);
  } else if (action.type === "POP") {
    if (state.global.items.length === 0) throw new Error("empty");
    state.global.items.pop();
  }
  return undefined;
};

const emptyDocument = (): PHDocument<ListState> =>
  baseCreateDocument<ListState>(
    (state) => ({ ...state, global: { items: [] }, local: {} }) as ListState,
    undefined,
    "",
    { "base-reducer": 3 },
  );

/** An in-memory scope with the writer's `error`, and a store reading it. */
function memoryScope() {
  const rows: Operation[] = [];
  const derived = () =>
    deriveScope(emptyDocument(), rows, () => listReducer, "global");
  let derives = 0;
  const store = {
    getSince: (
      _documentId: string,
      _scope: string,
      _branch: string,
      revision: number,
      _filter: unknown,
      paging?: { cursor: string; limit: number },
    ) => {
      const after = rows.filter((row) => row.index > revision);
      const offset = Number(paging?.cursor ?? 0);
      const limit = paging?.limit ?? after.length;
      const results = after.slice(offset, offset + limit);
      const more = offset + limit < after.length;
      return Promise.resolve({
        results,
        options: { cursor: String(offset), limit },
        nextCursor: more ? String(offset + limit) : undefined,
      });
    },
  } as unknown as IOperationStore;
  const derive: DeriveScopeForTargets = () => {
    derives++;
    return Promise.resolve({ rows: [...rows], applied: derived().applied });
  };
  const append = (action: Action, extra: Partial<Operation> = {}) => {
    const index = rows.length === 0 ? 0 : rows.at(-1)!.index + 1;
    const row = {
      id: `op-${action.id}-${index}`,
      index,
      skip: 0,
      hash: "",
      timestampUtcMs: action.timestampUtcMs,
      action,
      ...extra,
    } as Operation;
    rows.push(row);
    if (!derived().applied.has(action.id) && row.skip === 0) {
      if (action.type === "PUSH" || action.type === "POP") row.error = "threw";
    }
    return row;
  };
  const cold = () => {
    const { applied } = derived();
    return {
      undoTarget: undoTarget(rows, applied),
      redoTarget: redoTarget(rows, applied),
    };
  };
  return { rows, store, derive, append, cold, derives: () => derives };
}

let n = 0;
const action = (type: string): Action =>
  ({
    id: `a${n++}`,
    type,
    input: {},
    scope: "global",
    timestampUtcMs: new Date(Date.UTC(2026, 0, 1, 0, 0, n)).toISOString(),
  }) as Action;

describe("UndoTargetsCache", () => {
  it("advances over appends without re-deriving and matches a full derivation", async () => {
    const scope = memoryScope();
    const cache = new UndoTargetsCache(scope.store, scope.derive);
    const read = () => cache.resolve("doc", "global", "main");

    expect(await read()).toEqual(scope.cold());
    expect(scope.derives()).toBe(1);
    for (const type of ["PUSH", "PUSH", "POP", "POP", "POP", "NOOP", "PUSH"]) {
      scope.append(action(type));
      expect(await read()).toEqual(scope.cold());
    }
    scope.append(action("PUSH"), {
      deniedReason: "denied",
    } as Partial<Operation>);
    expect(await read()).toEqual(scope.cold());
    expect(scope.derives()).toBe(1);
  });

  it("re-derives once per RETRACT, rewind, named row or rewritten last row", async () => {
    const scope = memoryScope();
    const cache = new UndoTargetsCache(scope.store, scope.derive);
    const read = () => cache.resolve("doc", "global", "main");
    const pushed = scope.append(action("PUSH"));
    await read();
    expect(scope.derives()).toBe(1);

    scope.append({ ...retract(pushed.action.id, "global"), id: "r1" });
    expect(await read()).toEqual(scope.cold());
    expect(scope.derives()).toBe(2);

    scope.append(action("PUSH"), { skip: 1 });
    expect(await read()).toEqual(scope.cold());
    expect(scope.derives()).toBe(3);

    scope.append({ ...retract("later", "global"), id: "r2" });
    await read();
    scope.append({ ...action("PUSH"), id: "later" });
    expect(await read()).toEqual(scope.cold());
    expect(scope.derives()).toBe(5);

    scope.rows[scope.rows.length - 1] = {
      ...scope.rows.at(-1)!,
      id: "rewritten",
    };
    scope.append(action("PUSH"));
    expect(await read()).toEqual(scope.cold());
    expect(scope.derives()).toBe(6);

    scope.append(action("PUSH"));
    expect(await read()).toEqual(scope.cold());
    expect(scope.derives()).toBe(6);
  });

  it("forgets an entry whose read fails, and reads it again", async () => {
    const scope = memoryScope();
    let missing = false;
    const cache = new UndoTargetsCache(scope.store, (...args) =>
      missing
        ? Promise.reject(new DocumentNotFoundError("doc"))
        : scope.derive(...args),
    );
    const read = () => cache.resolve("doc", "global", "main");
    scope.append(action("PUSH"));
    await read();

    scope.rows.length = 0;
    missing = true;
    await expect(read()).rejects.toThrow(DocumentNotFoundError);
    missing = false;
    scope.append(action("PUSH"));
    expect(await read()).toEqual(scope.cold());
    expect(scope.derives()).toBe(2);
  });

  it("holds at most its capacity", async () => {
    const scope = memoryScope();
    const cache = new UndoTargetsCache(scope.store, scope.derive, 2);
    scope.append(action("PUSH"));
    for (const id of ["a", "b", "c", "a"]) {
      await cache.resolve(id, "global", "main");
    }
    expect(scope.derives()).toBe(4);
  });
});

describe("Reactor.resolveUndoRedo", () => {
  let client: ReactorClient;
  let module: InProcessReactorModule;

  afterEach(() => {
    module.reactor.kill();
  });

  it("equals a cold derivation after every edit, undo and redo", async () => {
    const built = await new ReactorClientBuilder()
      .withReactorBuilder(createUndoV3ReactorBuilder())
      .buildModule();
    client = built.client;
    module = built.reactorModule as InProcessReactorModule;
    const document = createBaseReducer3Document({ signaturePolicy: "legacy" });
    await client.create(document);
    const id = document.header.id;
    const derives = vi.spyOn(
      module.reactor as unknown as { deriveForUndo: () => unknown },
      "deriveForUndo",
    );

    const cold = async () => {
      const rows = (
        await module.operationStore.getSince(id, "global", "main", -1)
      ).results;
      const derive = await scopeDerivation(
        module.operationStore,
        module.documentModelRegistry,
        undefined,
        id,
        "main",
      );
      const head = await module.documentView.get(id, {
        branch: "main",
        scopes: ["global"],
      });
      const { applied } = derive(head, rows, "global");
      return {
        undoTarget: undoTarget(rows, applied),
        redoTarget: redoTarget(rows, applied),
      };
    };
    const steps: Array<() => Promise<unknown>> = [
      () => client.execute(id, "main", [setModelName({ name: "a" })]),
      () => client.execute(id, "main", [setModelName({ name: "b" })]),
      () => client.undo(id),
      () => client.execute(id, "main", [setModelName({ name: "c" })]),
      () => client.undo(id),
      () => client.undo(id),
      () => client.redo(id),
      () => client.execute(id, "main", [setModelName({ name: "d" })]),
    ];
    for (const step of steps) {
      await step();
      expect(await module.reactor.resolveUndoRedo(id, "global")).toEqual(
        await cold(),
      );
    }
    // The first read, then one per RETRACT; edits and presses advance.
    expect(derives).toHaveBeenCalledTimes(5);
  });
});
