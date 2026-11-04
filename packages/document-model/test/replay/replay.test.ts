import { describe, expect, it } from "vitest";
import {
  codeFirstParity,
  schemaFirstParity,
} from "../definition/fixtures/parity-model.js";
import {
  type AnyDocument,
  type AnyModule,
  firstDifference,
  replayArchive,
  snapshot,
  streamHistory,
} from "./harness.js";
import { type NamedHistory, PARITY_HISTORIES } from "./histories.js";

const schemaFirst = schemaFirstParity as unknown as AnyModule;
const codeFirst = codeFirstParity as unknown as AnyModule;

const sharedIdentityDocument = schemaFirst.utils.createDocument();

function freshDocument({ baseReducer }: NamedHistory): AnyDocument {
  if (baseReducer === undefined) return structuredClone(sharedIdentityDocument);
  const { header } = sharedIdentityDocument;
  return structuredClone({
    ...sharedIdentityDocument,
    header: {
      ...header,
      protocolVersions: {
        ...header.protocolVersions,
        "base-reducer": baseReducer,
      },
    },
  });
}

describe.each(PARITY_HISTORIES)("$name", (history) => {
  const { steps } = history;

  it("streams to the same state, operations and hashes at every prefix", () => {
    const left = streamHistory(schemaFirst, freshDocument(history), steps);
    const right = streamHistory(codeFirst, freshDocument(history), steps);
    expect(left.snapshots).toHaveLength(steps.length + 1);
    expect(firstDifference(left.snapshots, right.snapshots)).toBeNull();
  });

  it.each([
    ["schema first", "code first", schemaFirst, codeFirst],
    ["code first", "schema first", codeFirst, schemaFirst],
  ] as const)(
    "replays every prefix recorded on %s identically on %s",
    (_recorder, _replayer, recorder, replayer) => {
      const recorded = streamHistory(recorder, freshDocument(history), steps);
      const archived = recorded.documents.map((document) =>
        snapshot(replayArchive(replayer, document)),
      );
      const live = recorded.snapshots.map((entry) => ({
        ...entry,
        thrown: null,
      }));
      expect(firstDifference(live, archived)).toBeNull();
    },
  );
});

describe("the outcome each history exists for", () => {
  const outcomes = Object.fromEntries(
    PARITY_HISTORIES.map((history) => {
      const run = streamHistory(
        codeFirst,
        freshDocument(history),
        history.steps,
      );
      const last = run.documents.at(-1) as AnyDocument;
      const { global, local } = last.state as {
        global?: unknown;
        local?: unknown;
      };
      return [
        history.name,
        {
          name: last.header.name,
          thrown: run.snapshots.flatMap(({ thrown }) => thrown ?? []),
          state: { global, local },
          operations: ["global", "local"].flatMap((scope) =>
            (last.operations[scope] ?? []).map(
              ({ index, skip, action, error }) =>
                `${scope} ${index} ${skip} ${action.type}${error === undefined ? "" : ` error: ${error.replace(/\s+/g, " ").slice(0, 48)}`}`,
            ),
          ),
        },
      ];
    }),
  );
  const todo = (id: string) => ({ id, title: `todo ${id}`, completed: false });

  it.each([
    [
      "success",
      "",
      [],
      { global: { title: "board", todos: [] }, local: { note: "local note" } },
      [
        "global 0 0 ADD_TODO",
        "global 1 0 EDIT_TITLE",
        "global 2 0 ADD_TODO",
        "global 3 0 CLEAR",
        "local 0 0 SET_NOTE",
      ],
    ],
    [
      "validation-failure",
      "",
      [],
      {
        global: { title: "", todos: [todo("a"), todo("c")] },
        local: { note: null },
      },
      [
        "global 0 0 ADD_TODO",
        'global 1 0 ADD_TODO error: [ { "expected": "string", "code": "invalid_type"',
        "global 2 0 ADD_TODO",
      ],
    ],
    [
      "domain-error",
      "",
      [],
      {
        global: { title: "", todos: [todo("a")] },
        local: { note: "after the error" },
      },
      [
        "global 0 0 ADD_TODO",
        "local 0 0 SET_NOTE error: note rejected",
        "local 1 0 SET_NOTE",
      ],
    ],
    [
      "unknown-action",
      "",
      [],
      {
        global: { title: "", todos: [todo("a"), todo("b")] },
        local: { note: null },
      },
      [
        "global 0 0 ADD_TODO",
        "global 1 0 NOT_AN_OPERATION",
        "global 2 0 ADD_TODO",
      ],
    ],
    [
      "undo-redo",
      "",
      ["Cannot redo: no operations in the clipboard"],
      {
        global: { title: "", todos: [todo("a"), todo("c")] },
        local: { note: null },
      },
      [
        "global 0 0 ADD_TODO",
        "global 1 0 ADD_TODO",
        "global 2 1 NOOP",
        "global 3 0 ADD_TODO",
      ],
    ],
    [
      "retraction",
      "",
      [],
      {
        global: { title: "", todos: [todo("b"), todo("c")] },
        local: { note: null },
      },
      [
        "global 0 0 ADD_TODO",
        "global 1 0 ADD_TODO",
        "global 2 0 RETRACT",
        "global 3 0 ADD_TODO",
      ],
    ],
    [
      "document-action",
      "renamed",
      [],
      { global: { title: "", todos: [todo("a")] }, local: { note: null } },
      ["global 0 0 ADD_TODO", "global 1 0 SET_NAME"],
    ],
  ])("%s", (history, name, thrown, state, operations) => {
    expect(outcomes[history]).toStrictEqual({
      name,
      thrown,
      state,
      operations,
    });
  });
});

describe("firstDifference", () => {
  it("names the first prefix and coordinate where two runs part", () => {
    const [success] = PARITY_HISTORIES;
    const changed = success.steps.map((step, position) =>
      position === 1
        ? { action: { ...step.action, input: { title: "other" } } }
        : step,
    );
    const left = streamHistory(
      codeFirst,
      freshDocument(success),
      success.steps,
    );
    const right = streamHistory(codeFirst, freshDocument(success), changed);
    expect(firstDifference(left.snapshots, right.snapshots)).toMatchObject({
      prefix: 2,
      coordinate: "state",
    });
  });
});
