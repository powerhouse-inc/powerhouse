import {
  defaultBaseState,
  type DefinitionSource,
} from "@powerhousedao/shared/document-model";
import { expect } from "vitest";
import {
  compileSubgraph,
  createSubgraphEntryBuilders,
  SUBGRAPH_PROTOCOL,
  type SubgraphDescription,
  type SubgraphEntry,
  type SubgraphProtocol,
} from "../../../src/definition/index.js";
import { canonicalDigest } from "../../../src/definition/kernel/primitives.js";
import type { NormalizedDocumentModelArtifact } from "../../../src/definition/tooling/adapters/types.js";
import type { DefinitionSourceSet } from "../../../src/definition/tooling/definition-source-types.js";
import { adaptSchemaFirstDocumentModelModule } from "../../../src/definition/tooling/schema-first/schema-first-document-model-module-adapter.js";
import { storedModel } from "../project-fixtures.js";

export type Builders = ReturnType<typeof createSubgraphEntryBuilders>;

/**
 * A code-first base as reactor-api's `Subgraph` implements the protocol:
 * a static `subgraphName`, a static `getSchema(schema)`, and a protocol whose
 * `describe()` compiles the class that reads it. Its constructor throws, so
 * a test that constructed a class would fail.
 */
export class Subgraph {
  static subgraphName: string | undefined;
  static getSchema(_schema: Builders): readonly SubgraphEntry[] {
    return [];
  }
  static get [SUBGRAPH_PROTOCOL](): SubgraphProtocol {
    return {
      version: 1,
      describe: (): SubgraphDescription => {
        const name = this.subgraphName;
        if (name === undefined) return { diagnostics: [] };
        const { definition, diagnostics } = compileSubgraph({
          name,
          entries: this.getSchema(createSubgraphEntryBuilders()),
        });
        return {
          name,
          ...(definition !== undefined && { definition }),
          diagnostics,
        };
      },
      validate: () => ({ ok: true }),
    };
  }
  constructor() {
    throw new Error("a code-first subgraph was constructed");
  }
}

/** A code-first subgraph class with `entries`, named `name`. */
export function codeFirst(
  name: string,
  entries: (schema: Builders) => readonly SubgraphEntry[],
): typeof Subgraph {
  return class extends Subgraph {
    static override subgraphName = name;
    static override getSchema(schema: Builders) {
      return entries(schema);
    }
  };
}

export function sourceSet(...sources: DefinitionSource[]): DefinitionSourceSet {
  const value = {
    origin: "discovery",
    documentModelsDir: "./document-models",
    sources,
    stored: [],
  } as const;
  return { ...value, digest: canonicalDigest(value) };
}

/** A stored model named `name`, with a `<name>State` of one title. */
export function storedArtifact(
  documentType: string,
  name: string,
): NormalizedDocumentModelArtifact {
  const result = adaptSchemaFirstDocumentModelModule(
    {
      ...defaultBaseState(),
      global: JSON.parse(storedModel(documentType, name)) as unknown,
      local: {},
    },
    { specifier: `./document-models/${name.toLowerCase()}/model.json` },
  );
  expect(result.diagnostics).toEqual([]);
  return result.artifacts[0];
}
