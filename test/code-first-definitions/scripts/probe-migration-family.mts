import {
  hashDocumentStateForScope,
  type Action,
  type DocumentModelModule,
  type PHDocument,
} from "document-model";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  canonicalJson as canonical,
  compareCodeUnits,
  sha256,
} from "../src/evidence/utils.js";

const mode = process.argv[2];
if (mode !== "legacy" && mode !== "candidate") {
  throw new Error("Expected migration family mode: legacy or candidate.");
}

const packageRoot = resolve(import.meta.dirname, "..");
const histories = JSON.parse(
  await readFile(
    resolve(packageRoot, "fixtures/migrations/v1/histories.json"),
    "utf8",
  ),
) as {
  readonly histories: readonly {
    readonly historyId: string;
    readonly version: number;
    readonly initialDocument: PHDocument;
    readonly actions: readonly Action[];
  }[];
};

let modules: readonly DocumentModelModule[];
if (mode === "legacy") {
  const [{ Todo: v1 }, { Todo: v2 }] = await Promise.all([
    import("../../versioned-documents/document-models/todo/v1/module.js"),
    import("../../versioned-documents/document-models/todo/v2/module.js"),
  ]);
  modules = [v1, v2] as unknown as readonly DocumentModelModule[];
} else {
  const candidateSpecifier: string =
    "../../versioned-documents/document-models/.verification/todo/code-first.js";
  const candidate = (await import(candidateSpecifier)) as {
    readonly documentModels: readonly unknown[];
  };
  modules =
    candidate.documentModels as unknown as readonly DocumentModelModule[];
}

function projection(document: PHDocument) {
  return {
    state: document.state,
    initialState: document.initialState,
    revision: document.header.revision,
    scopeHashes: Object.fromEntries(
      Object.keys(document.state)
        .sort(compareCodeUnits)
        .map((scope) => [scope, hashDocumentStateForScope(document, scope)]),
    ),
    operations: Object.fromEntries(
      Object.entries(document.operations)
        .sort(([left], [right]) => compareCodeUnits(left, right))
        .map(([scope, entries]) => [
          scope,
          entries.map((operation) => ({
            index: operation.index,
            skip: operation.skip,
            type: operation.action.type,
            scope: operation.action.scope,
            input: operation.action.input,
            error: operation.error ?? null,
            deniedReason: operation.deniedReason ?? null,
          })),
        ]),
    ),
  };
}

const results = histories.histories.flatMap((history) => {
  const module = modules.find(
    (candidate) => (candidate.version ?? 1) === history.version,
  );
  if (!module) throw new Error(`Missing ${mode} version ${history.version}.`);
  let document = structuredClone(history.initialDocument);
  return Array.from(
    { length: history.actions.length + 1 },
    (_, prefixIndex) => {
      if (prefixIndex > 0) {
        document = module.reducer(
          document,
          structuredClone(history.actions[prefixIndex - 1]!),
          undefined,
          { protocolVersion: 1 },
        ) as PHDocument;
      }
      return {
        historyId: history.historyId,
        prefixIndex,
        document: projection(document),
      };
    },
  );
});

const bytes = canonical(results);
process.stdout.write(
  `${JSON.stringify({
    mode,
    family: "test/todo",
    versions: modules.map((module) => module.version ?? 1),
    prefixCount: results.length,
    digest: sha256(bytes),
  })}\n`,
);
