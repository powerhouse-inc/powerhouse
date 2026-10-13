// @vitest-environment node
import { customSubgraphSchemaTemplate } from "@powerhousedao/codegen/templates";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { lintSubgraphTypes } from "../codegen/subgraph-type-lint.js";

const temporary: string[] = [];

afterEach(() => {
  for (const dir of temporary.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

// A project with vetra's "Subgraph Module" model and one custom subgraph.
function makeProject(subgraph: string, schema: string): string {
  const root = mkdtempSync(join(tmpdir(), "ph-subgraph-lint-"));
  temporary.push(root);
  const modelDir = join(root, "document-models", "subgraph-module");
  mkdirSync(modelDir, { recursive: true });
  copyFileSync(
    join(
      import.meta.dirname,
      "../document-models/subgraph-module/subgraph-module.json",
    ),
    join(modelDir, "subgraph-module.json"),
  );
  mkdirSync(join(root, "subgraphs", subgraph), { recursive: true });
  writeFileSync(join(root, "subgraphs", subgraph, "schema.ts"), schema);
  return root;
}

const schemaFile = (sdl: string) =>
  `import { gql } from "graphql-tag";\n\nexport const schema = gql\`\n${sdl}\n\`;\n`;

describe("lintSubgraphTypes", () => {
  it("is silent on a subgraph generated from the template", () => {
    const root = makeProject(
      "subgraph-module",
      customSubgraphSchemaTemplate({
        pascalCaseName: "SubgraphModule",
        camelCaseName: "subgraphModule",
      }),
    );

    expect(lintSubgraphTypes(root)).toEqual([]);
  });

  it("warns on a type the package's model subgraph generates", () => {
    const root = makeProject(
      "subgraph-module",
      schemaFile(`
        type SubgraphModuleQueries {
          example(driveId: String!): String
        }
        type Query {
          subgraphModule: SubgraphModuleQueries!
        }
      `),
    );

    expect(lintSubgraphTypes(root)).toEqual([
      'Subgraph "subgraph-module" defines SubgraphModuleQueries (owned by "subgraph-module"), so the supergraph leaves it out. Rename them in subgraphs/subgraph-module/schema.ts.',
    ]);
  });

  it("warns on core and reserved types", () => {
    const root = makeProject(
      "ledger",
      schemaFile(`
        type Revision {
          id: ID
        }
        type Operation {
          id: ID
        }
        type Query {
          ledger: Revision
        }
      `),
    );

    expect(lintSubgraphTypes(root)).toEqual([
      'Subgraph "ledger" defines Operation (owned by "document-model schema"), Revision (owned by "r"), so the supergraph leaves it out. Rename them in subgraphs/ledger/schema.ts.',
    ]);
  });

  it("skips a schema built from substitutions", () => {
    const root = makeProject(
      "ledger",
      'import { gql } from "graphql-tag";\nconst sdl = `type Revision { id: ID }`;\nexport const schema = gql`${sdl}`;\n',
    );

    expect(lintSubgraphTypes(root)).toEqual([]);
  });
});
