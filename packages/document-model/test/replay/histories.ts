import type { Action } from "@powerhousedao/shared/document-model";
import type { HistoryStep } from "./harness.js";

/**
 * Committed synthetic histories, one per protocol outcome.
 *
 * Every action carries a fixed id and timestamp: both implementations have to
 * see the same bytes, and a generated id would make the comparison depend on
 * when the suite ran. Production-derived histories need an access-controlled
 * verifier and privacy approval, so the committed corpus is the proof.
 */

let counter = 0;

function action(type: string, input: unknown, scope = "global"): Action {
  counter += 1;
  return {
    id: `replay-${String(counter).padStart(4, "0")}`,
    timestampUtcMs: new Date(Date.UTC(2026, 0, 1, 0, 0, counter)).toISOString(),
    type,
    input,
    scope,
  };
}

function step(type: string, input: unknown, scope?: string): HistoryStep {
  return { action: action(type, input, scope) };
}

export type NamedHistory = {
  readonly name: string;
  /** What this history pins, for a reader deciding whether it still matters. */
  readonly covers: string;
  readonly steps: readonly HistoryStep[];
};

/** Histories for the single-version parity pair. */
export function parityHistories(): readonly NamedHistory[] {
  counter = 0;
  const todo = (id: string, title: string) => ({
    id,
    title,
    completed: false,
  });
  return [
    {
      name: "success",
      covers: "applied operations in both scopes",
      steps: [
        step("ADD_TODO", todo("a", "first")),
        step("ADD_TODO", todo("b", "second")),
        step("EDIT_TITLE", { title: "board" }),
        step("SET_NOTE", { note: "local note" }, "local"),
        step("CLEAR", {}),
      ],
    },
    {
      name: "validation-failure",
      covers: "an input the validator rejects, recorded and rolled back",
      steps: [
        step("ADD_TODO", todo("a", "first")),
        step("ADD_TODO", { id: 4, title: "wrong type", completed: false }),
        step("ADD_TODO", todo("c", "after the failure")),
      ],
    },
    {
      name: "domain-error",
      covers: "a reducer that throws, with the exact message persisted",
      steps: [
        step("ADD_TODO", todo("a", "first")),
        step("SET_NOTE", { note: "boom" }, "local"),
        step("ADD_TODO", todo("d", "after the error")),
      ],
    },
    {
      name: "unknown-action",
      covers: "an action type neither module declares: a no-op, not a throw",
      steps: [
        step("ADD_TODO", todo("a", "first")),
        step("NOT_AN_OPERATION", { anything: true }),
        step("ADD_TODO", todo("b", "second")),
      ],
    },
    {
      name: "wrong-scope",
      covers:
        "an action whose persisted scope differs from the declared one: state is selected by the persisted scope, which is retained compatibility",
      steps: [
        step("ADD_TODO", todo("a", "first")),
        step(
          "SET_NOTE",
          { note: "declared local, persisted global" },
          "global",
        ),
      ],
    },
    {
      name: "unknown-scope",
      covers: "an unknown runtime scope string keeps its current handling",
      steps: [
        step("ADD_TODO", todo("a", "first")),
        step("ADD_TODO", todo("b", "second"), "somewhere-else"),
      ],
    },
    {
      name: "unknown-keys",
      covers: "unknown input keys survive at every depth and reach the reducer",
      steps: [
        step("ADD_TODO", {
          ...todo("a", "first"),
          extra: { nested: [1, { deeper: true }] },
        }),
      ],
    },
    {
      name: "undo-redo",
      covers:
        "undo through the platform's own replay, and redo refusing because the clipboard the base reducer would fill is commented out today",
      steps: [
        step("ADD_TODO", todo("a", "first")),
        step("ADD_TODO", todo("b", "second")),
        step("UNDO", { count: 1 }),
        step("REDO", { count: 1 }),
      ],
    },
    {
      name: "duplicate-index-undo",
      covers:
        "protocol v1 undo reusing an index with an increasing skip, which both adapters accept",
      steps: [
        step("ADD_TODO", todo("a", "first")),
        step("ADD_TODO", todo("b", "second")),
        step("ADD_TODO", todo("c", "third")),
        { action: action("NOOP", undefined), options: { skip: 1 } },
        { action: action("NOOP", undefined), options: { skip: 2 } },
      ],
    },
    {
      name: "prune-global",
      covers:
        "source-mode PRUNE, which the shared reducer rejects before commit because its internal LOAD_STATE uses an older flattened shape than the loader expects — a deferred protocol correction, recorded identically for both",
      steps: [
        step("ADD_TODO", todo("a", "first")),
        step("ADD_TODO", todo("b", "second")),
        step("PRUNE", { start: 0, end: 1 }),
      ],
    },
    {
      name: "prune-local",
      covers:
        "local prune, which reads and rewrites global history unconditionally — also deferred, also recorded identically",
      steps: [
        step("ADD_TODO", todo("a", "first")),
        step("SET_NOTE", { note: "local" }, "local"),
        step("PRUNE", { start: 0, end: 1 }, "local"),
      ],
    },
    {
      name: "load-state",
      covers: "LOAD_STATE keeps its current behavior",
      steps: [
        step("ADD_TODO", todo("a", "first")),
        step("LOAD_STATE", {
          state: { name: "loaded", data: { title: "loaded", todos: [] } },
          operations: 1,
        }),
      ],
    },
    {
      name: "set-name",
      covers: "a document action reaches the header, not the state reducer",
      steps: [
        step("ADD_TODO", todo("a", "first")),
        step("SET_NAME", { name: "renamed" }),
      ],
    },
  ];
}

/** Histories for the two-version family pair. */
export function familyHistories(): readonly NamedHistory[] {
  counter = 1000;
  return [
    {
      name: "v1-success",
      covers: "the v1 operation set on a v1 document",
      steps: [step("ADD_TASK", { id: "one" }), step("ADD_TASK", { id: "two" })],
    },
    {
      name: "v2-success",
      covers: "the v2 operation set, including the operation v1 does not have",
      steps: [
        step("ADD_TASK", { id: "one" }),
        step("SET_TITLE", { title: "sprint" }),
        step("ADD_TASK", { id: "two" }),
      ],
    },
    {
      name: "v2-unknown-on-v1",
      covers: "a v2 action reaching a v1 module is a no-op",
      steps: [
        step("ADD_TASK", { id: "one" }),
        step("SET_TITLE", { title: "not in v1" }),
      ],
    },
  ];
}
