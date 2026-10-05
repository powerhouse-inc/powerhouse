import type { NormalizedDocumentModelArtifact } from "../../src/definition/adapters/types.js";
import { adaptCodeFirstDocumentModelSource } from "../../src/definition/adapters/code-first-document-model-source-adapter.js";
import { adaptSchemaFirstDocumentModelModule } from "../../src/definition/tooling/adapters/schema-first-document-model-module-adapter.js";
import { CORPUS_ROOTS, readCorpusState } from "../tooling/corpus.js";
import * as appModule from "./corpus/app-module.code-first.js";
import * as documentDrive from "./corpus/document-drive.code-first.js";
import * as documentEditor from "./corpus/document-editor.code-first.js";
import * as e2eTodo from "./corpus/e2e-todo.code-first.js";
import * as processorModule from "./corpus/processor-module.code-first.js";
import * as reactorGroup from "./corpus/reactor-group.code-first.js";
import * as subgraphModule from "./corpus/subgraph-module.code-first.js";
import * as sample from "./corpus/sample.code-first.js";
import * as versionedTodo from "./corpus/versioned-todo.code-first.js";
import * as vetraPackage from "./corpus/vetra-package.code-first.js";

/**
 * The parity corpus: every model root this repository ships, declared twice.
 *
 * The schema-first side is the stored model file, read from its real path.
 * The code-first side is a committed declaration beside it. Both are
 * normalized through their own adapter, and the suite compares what comes
 * out — not the sources.
 */

export type CodeFirstFixture = {
  readonly modules: readonly unknown[];
};

export type ParityRoot = {
  readonly name: string;
  readonly versions: readonly number[];
  /** One artifact per version, from the code-first declaration. */
  readonly codeFirst: readonly NormalizedDocumentModelArtifact[];
  /** One artifact per version, from the stored schema-first model. */
  readonly schemaFirst: readonly NormalizedDocumentModelArtifact[];
};

/** Every committed declaration, named so a reader can find its file. */
const CODE_FIRST: Readonly<Partial<Record<string, CodeFirstFixture>>> = {
  "document-drive": documentDrive,
  "reactor-group": reactorGroup,
  "app-module": appModule,
  "document-editor": documentEditor,
  "processor-module": processorModule,
  "subgraph-module": subgraphModule,
  "vetra-package": vetraPackage,
  "e2e-todo": e2eTodo,
  "versioned-todo": versionedTodo,
  sample,
};

/**
 * Every shipped model has zero examples, so the corpus carries one synthetic
 * root that has them in both positions, plus a scalar reached only from an
 * operation input. Its stored side is written in the fixture rather than
 * read from disk, because no such model exists to read.
 */
const SAMPLE_ROOT = {
  name: "sample",
  path: "./test/parity/corpus/sample.code-first.ts",
  versions: [1],
} as const;

export function loadParityRoots(): readonly ParityRoot[] {
  const roots: ParityRoot[] = [];
  for (const root of [...CORPUS_ROOTS, SAMPLE_ROOT]) {
    const fixture = CODE_FIRST[root.name];
    if (fixture === undefined) {
      throw new Error(`${root.name} has no committed code-first declaration.`);
    }
    const state =
      root.name === SAMPLE_ROOT.name
        ? sample.sampleStoredState
        : readCorpusState(root);

    const codeFirst = fixture.modules.map((module) => {
      const result = adaptCodeFirstDocumentModelSource(module, {
        specifier: `./corpus/${root.name}.code-first.js`,
      });
      if (result.artifacts.length !== 1) {
        throw new Error(
          `${root.name}: code-first normalization failed: ${result.diagnostics
            .map((entry) => entry.message)
            .join("; ")}`,
        );
      }
      return result.artifacts[0];
    });

    const schemaFirst = root.versions.map((version) => {
      const result = adaptSchemaFirstDocumentModelModule(
        state,
        { specifier: `./${root.path}` },
        { version },
      );
      if (result.artifacts.length !== 1) {
        throw new Error(
          `${root.name} v${version}: schema-first normalization failed: ${result.diagnostics
            .map((entry) => entry.message)
            .join("; ")}`,
        );
      }
      return result.artifacts[0];
    });

    roots.push({
      name: root.name,
      versions: root.versions,
      codeFirst,
      schemaFirst,
    });
  }
  return roots;
}
