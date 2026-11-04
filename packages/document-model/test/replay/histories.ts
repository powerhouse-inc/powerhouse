import type { Action } from "@powerhousedao/shared/document-model";
import type { HistoryStep } from "./harness.js";

export type NamedHistory = {
  readonly name: string;
  readonly steps: readonly HistoryStep[];
  readonly baseReducer?: 3;
};

function historyOf(
  name: string,
  steps: readonly (readonly [string, unknown, string?])[],
  baseReducer?: 3,
): NamedHistory {
  return {
    name,
    ...(baseReducer && { baseReducer }),
    steps: steps.map(([type, input, scope = "global"], position) => {
      const action: Action = {
        id: `${name}-${position}`,
        timestampUtcMs: new Date(
          Date.UTC(2026, 0, 1, 0, 0, position),
        ).toISOString(),
        type,
        input,
        scope,
      };
      return { action };
    }),
  };
}

const todo = (id: string) => ({ id, title: `todo ${id}`, completed: false });

export const PARITY_HISTORIES: readonly NamedHistory[] = [
  historyOf("success", [
    ["ADD_TODO", todo("a")],
    ["EDIT_TITLE", { title: "board" }],
    ["SET_NOTE", { note: "local note" }, "local"],
    ["ADD_TODO", todo("b")],
    ["CLEAR", {}],
  ]),
  historyOf("validation-failure", [
    ["ADD_TODO", todo("a")],
    ["ADD_TODO", { id: 4, title: "wrong type", completed: false }],
    ["ADD_TODO", todo("c")],
  ]),
  historyOf("domain-error", [
    ["ADD_TODO", todo("a")],
    ["SET_NOTE", { note: "boom" }, "local"],
    ["SET_NOTE", { note: "after the error" }, "local"],
  ]),
  historyOf("unknown-action", [
    ["ADD_TODO", todo("a")],
    ["NOT_AN_OPERATION", { anything: true }],
    ["ADD_TODO", todo("b")],
  ]),
  historyOf("undo-redo", [
    ["ADD_TODO", todo("a")],
    ["ADD_TODO", todo("b")],
    ["UNDO", { count: 1 }],
    ["REDO", { count: 1 }],
    ["ADD_TODO", todo("c")],
  ]),
  historyOf(
    "retraction",
    [
      ["ADD_TODO", todo("a")],
      ["ADD_TODO", todo("b")],
      ["RETRACT", { target: "retraction-0" }],
      ["ADD_TODO", todo("c")],
    ],
    3,
  ),
  historyOf("document-action", [
    ["ADD_TODO", todo("a")],
    ["SET_NAME", { name: "renamed" }],
  ]),
];
