import type {
  DocumentModelGlobalState,
  DocumentModelPHState,
} from "@powerhousedao/shared/document-model";
import {
  createState,
  defaultBaseState,
} from "@powerhousedao/shared/document-model";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * The nine model roots this repository ships, read from the authored model
 * files rather than copied. A copy would go stale silently; reading the real
 * file makes a model change fail the parity suite, which is the signal that
 * suite exists to give.
 */

export type CorpusRoot = {
  readonly name: string;
  /** Repository-relative path, from the document-model package. */
  readonly path: string;
  /** The version each specification in the file serves, in order. */
  readonly versions: readonly number[];
};

export const CORPUS_ROOTS: readonly CorpusRoot[] = [
  {
    name: "document-drive",
    path: "../shared/document-drive/document-drive.json",
    versions: [1],
  },
  {
    name: "reactor-group",
    path: "../reactor-group/document-models/reactor-group/reactor-group.json",
    versions: [1],
  },
  {
    name: "app-module",
    path: "../vetra/document-models/app-module/app-module.json",
    versions: [1],
  },
  {
    name: "document-editor",
    path: "../vetra/document-models/document-editor/document-editor.json",
    versions: [1],
  },
  {
    name: "processor-module",
    path: "../vetra/document-models/processor-module/processor-module.json",
    versions: [1],
  },
  {
    name: "subgraph-module",
    path: "../vetra/document-models/subgraph-module/subgraph-module.json",
    versions: [1],
  },
  {
    name: "vetra-package",
    path: "../vetra/document-models/vetra-package/vetra-package.json",
    versions: [1],
  },
  {
    name: "e2e-todo",
    path: "../../test/package-e2e/fixtures/todo.json",
    versions: [1],
  },
  {
    name: "versioned-todo",
    path: "../../test/versioned-documents/document-models/todo/todo.json",
    versions: [1, 2],
  },
];

const PACKAGE_ROOT = fileURLToPath(new URL("../../", import.meta.url));

type StoredFile = {
  readonly state?: { readonly global?: DocumentModelGlobalState };
  readonly global?: DocumentModelGlobalState;
  readonly specifications?: unknown;
};

/**
 * The stored `DocumentModelPHState` a model file describes. An authored
 * model file is the bare global state, which a generated module wraps with
 * `createState(defaultBaseState(), global)` — the same wrapping here keeps
 * the corpus and a real module the same shape.
 */
export function readCorpusState(root: CorpusRoot): DocumentModelPHState {
  const raw = JSON.parse(
    readFileSync(new URL(root.path, new URL(PACKAGE_ROOT, "file:")), "utf8"),
  ) as StoredFile;
  const global =
    raw.state?.global ??
    raw.global ??
    (raw.specifications === undefined
      ? undefined
      : (raw as unknown as DocumentModelGlobalState));
  if (global === undefined) {
    throw new Error(`${root.name} has no stored global state.`);
  }
  return createState(defaultBaseState(), global);
}
