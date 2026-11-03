import type { Action } from "@powerhousedao/shared/document-model";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import {
  codeFirstParity,
  schemaFirstParity,
} from "../definition/fixtures/parity-model.js";
import { versionedTodo } from "../parity/corpus/versioned-todo.js";
import {
  type AnyDocument,
  type AnyModule,
  replayArchive,
  snapshot,
} from "../replay/harness.js";

const REPO_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));

type Route = "creator" | "raw action" | "archived replay";

type Row = {
  readonly subject: "parity" | "todo v2";
  readonly route: Route;
  readonly outcome: string;
  readonly creator?: readonly [string, unknown];
  readonly action?: readonly [string, unknown, string?];
  readonly expected: string;
};

const todo = { id: "a", title: "first", completed: false };

const ROWS: readonly Row[] = [
  {
    subject: "parity",
    route: "creator",
    outcome: "validation failure",
    creator: ["addTodo", { ...todo, id: 4 }],
    expected: "creator threw InvalidActionInputZodError",
  },
  {
    subject: "todo v2",
    route: "creator",
    outcome: "accepted",
    creator: ["editTitle", { title: "v2 only" }],
    expected: "applied EDIT_TITLE",
  },
  {
    subject: "todo v2",
    route: "raw action",
    outcome: "validation failure",
    action: ["ADD_TODO", { ...todo, title: null }],
    expected: "recorded ADD_TODO validation error, state unchanged",
  },
  {
    subject: "todo v2",
    route: "archived replay",
    outcome: "unknown action type",
    action: ["NOT_AN_OPERATION", {}],
    expected: "recorded NOT_AN_OPERATION, state unchanged",
  },
  {
    subject: "todo v2",
    route: "archived replay",
    outcome: "platform action",
    action: ["UNDO", { count: 1 }],
    expected: "applied NOOP",
  },
];

type Pair = { readonly schemaFirst: AnyModule; readonly codeFirst: AnyModule };

async function importOutsideTsProgram<T>(repoPath: string): Promise<T> {
  return (await import(pathToFileURL(`${REPO_ROOT}${repoPath}`).href)) as T;
}

async function generatedTodoV2(): Promise<AnyModule> {
  const { Todo } = await importOutsideTsProgram<{ readonly Todo: AnyModule }>(
    "test/versioned-documents/document-models/todo/v2/module.ts",
  );
  return Todo;
}

const isValidatorIssueList = (error: string) => error.startsWith("[");

const PAIRS: Readonly<Record<Row["subject"], Pair>> = {
  parity: {
    schemaFirst: schemaFirstParity as unknown as AnyModule,
    codeFirst: codeFirstParity as unknown as AnyModule,
  },
  "todo v2": {
    schemaFirst: await generatedTodoV2(),
    codeFirst: versionedTodo.at(2) as unknown as AnyModule,
  },
};

const DOCUMENTS = Object.fromEntries(
  Object.entries(PAIRS).map(([subject, { schemaFirst }]) => {
    const created = schemaFirst.utils.createDocument();
    const seeded = schemaFirst.reducer(
      created,
      rawAction(["ADD_TODO", todo], "matrix-seed", "2026-01-01T00:00:00.000Z"),
    );
    return [subject, seeded];
  }),
) as Readonly<Record<Row["subject"], AnyDocument>>;

function rawAction(
  [type, input, scope = "global"]: readonly [string, unknown, string?],
  id = "matrix-row",
  timestampUtcMs = "2026-01-01T00:00:01.000Z",
): Action {
  return {
    id,
    timestampUtcMs,
    type,
    input,
    scope,
  };
}

function apply(row: Row, module: AnyModule, schemaFirst: AnyModule) {
  const document = structuredClone(DOCUMENTS[row.subject]);
  if (row.route === "creator") {
    const [key, input] = row.creator ?? ["", null];
    const creators = module.actions as Record<
      string,
      (input: unknown) => Action
    >;
    let action: Action;
    try {
      action = creators[key](input);
    } catch (error) {
      return { document, thrown: (error as Error).name };
    }
    return { document: module.reducer(document, action), thrown: null };
  }
  const action = rawAction(row.action ?? ["", null]);
  if (row.route === "raw action") {
    return { document: module.reducer(document, action), thrown: null };
  }
  const recorded = schemaFirst.reducer(document, action);
  return { document: replayArchive(module, recorded), thrown: null };
}

function observe(row: Row, module: AnyModule, schemaFirst: AnyModule) {
  const before = snapshot(DOCUMENTS[row.subject]);
  const { document, thrown } = apply(row, module, schemaFirst);
  const after = snapshot(document);
  if (thrown !== null) return { summary: `creator threw ${thrown}`, after };
  const last = Object.values(document.operations)
    .flat()
    .filter(({ action }) => action.scope !== "document")
    .sort(
      (a, b) =>
        a.timestampUtcMs.localeCompare(b.timestampUtcMs) || a.index - b.index,
    )
    .at(-1);
  const unchanged = after.state === before.state ? ", state unchanged" : "";
  const error =
    last?.error === undefined
      ? ""
      : isValidatorIssueList(last.error)
        ? " validation error"
        : ` error: ${last.error}`;
  const verb = error === "" && unchanged === "" ? "applied" : "recorded";
  return {
    summary: `${verb} ${last?.action.type}${error}${unchanged}`,
    after,
  };
}

describe("protocol matrix", () => {
  it.each(
    ROWS.map((row) => ({
      ...row,
      label: `${row.subject} ${row.route}: ${row.outcome}`,
    })),
  )("$label", (row) => {
    const { schemaFirst, codeFirst } = PAIRS[row.subject];
    const left = observe(row, schemaFirst, schemaFirst);
    const right = observe(row, codeFirst, schemaFirst);
    expect(right.summary).toBe(row.expected);
    expect(right).toStrictEqual(left);
  });
});
