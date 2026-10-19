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

// A project with vetra's "Subgraph Module" model and the given subgraphs.
function makeProject(subgraphs: Record<string, string>): string {
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
  for (const [dir, schema] of Object.entries(subgraphs)) {
    mkdirSync(join(root, "subgraphs", dir), { recursive: true });
    writeFileSync(join(root, "subgraphs", dir, "schema.ts"), schema);
  }
  return root;
}

function writeModel(
  root: string,
  name: string,
  { operationSchema = "", globalSchema = "" },
): void {
  const dir = join(root, "document-models", name.toLowerCase());
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, `${name.toLowerCase()}.json`),
    JSON.stringify({
      id: `test/${name.toLowerCase()}`,
      name,
      author: { name: "", website: "" },
      extension: "",
      description: "",
      specifications: [
        {
          version: 1,
          changeLog: [],
          modules: [
            {
              id: "m",
              name: "base",
              description: "",
              operations: [
                {
                  id: "o",
                  name: "SET",
                  description: "",
                  schema: operationSchema,
                  template: "",
                  reducer: "",
                  errors: [],
                  examples: [],
                  scope: "global",
                },
              ],
            },
          ],
          state: {
            global: { schema: globalSchema, initialValue: "", examples: [] },
            local: { schema: "", initialValue: "", examples: [] },
          },
        },
      ],
    }),
  );
}

const schemaFile = (sdl: string) =>
  `import { gql } from "graphql-tag";\n\nexport const schema = gql\`\n${sdl}\n\`;\n`;

const template = (pascalCaseName: string, camelCaseName: string) =>
  customSubgraphSchemaTemplate({ pascalCaseName, camelCaseName });

describe("lintSubgraphTypes", () => {
  it("is silent on the template under a name of its own", async () => {
    const root = makeProject({
      "subgraph-tools": template("SubgraphTools", "subgraphTools"),
    });

    expect(await lintSubgraphTypes(root)).toEqual([]);
  });

  it("warns on a subgraph named like the package's model subgraph", async () => {
    const root = makeProject({
      "subgraph-module": template("SubgraphModule", "subgraphModule"),
    });

    expect(await lintSubgraphTypes(root)).toEqual([
      'Subgraph "subgraph-module" has the name of a document model subgraph, so the server refuses it. Rename the subgraph.',
    ]);
  });

  it("reads the subgraph's name from its index.ts", async () => {
    const root = makeProject({ tools: template("Tools", "tools") });
    writeFileSync(
      join(root, "subgraphs", "tools", "index.ts"),
      'export class ToolsSubgraph extends BaseSubgraph {\n  name = "system";\n}\n',
    );

    expect(await lintSubgraphTypes(root)).toEqual([
      'Subgraph "system" has the name of a core subgraph, so the server refuses it. Rename the subgraph.',
    ]);
  });

  it("warns on a type the package's model subgraph generates", async () => {
    const root = makeProject({
      tools: schemaFile(`
        type SubgraphModuleQueries {
          example(driveId: String!): String
        }
        type Query {
          tools: SubgraphModuleQueries!
        }
      `),
    });

    expect(await lintSubgraphTypes(root)).toEqual([
      'Subgraph "tools" defines SubgraphModuleQueries (owned by "subgraph-module"), so the supergraph leaves it out. Rename them in its schema.ts.',
    ]);
  });

  it("warns on core and reserved types", async () => {
    const root = makeProject({
      ledger: schemaFile(`
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
    });

    expect(await lintSubgraphTypes(root)).toEqual([
      'Subgraph "ledger" defines Operation (owned by "document-model schema"), so the supergraph leaves it out. Rename them in its schema.ts.',
    ]);
  });

  it("warns on a root field another of the package's subgraphs serves", async () => {
    const sdl = schemaFile(`
      type Query {
        ledger: String
      }
    `);
    const root = makeProject({ ledger: sdl, "ledger-copy": sdl });
    mkdirSync(join(root, "subgraphs"), { recursive: true });
    writeFileSync(
      join(root, "subgraphs", "index.ts"),
      'export * as A from "./ledger/index.js";\nexport * as B from "./ledger-copy/index.js";\n',
    );

    expect(await lintSubgraphTypes(root)).toEqual([
      'Subgraph "ledger-copy" defines Query.ledger (owned by "ledger"), so the supergraph leaves it out. Rename them in its schema.ts.',
    ]);
  });

  it("warns on a model the server refuses and checks the rest", async () => {
    const root = makeProject({
      "subgraph-module": template("SubgraphModule", "subgraphModule"),
    });
    writeModel(root, "Broken", { operationSchema: "input BrokenInput {" });

    expect(await lintSubgraphTypes(root)).toEqual([
      'Document model "Broken" is refused by the server: has an unusable schema: Unknown type "Broken_BrokenState".',
      'Subgraph "subgraph-module" has the name of a document model subgraph, so the server refuses it. Rename the subgraph.',
    ]);
  });

  it("warns on two subgraphs with one name", async () => {
    const root = makeProject({
      ledger: template("Ledger", "ledger"),
      "ledger-copy": template("Ledger", "ledger"),
    });
    writeFileSync(
      join(root, "subgraphs", "ledger-copy", "index.ts"),
      'export class LedgerSubgraph extends BaseSubgraph {\n  name = "ledger";\n}\n',
    );

    expect(await lintSubgraphTypes(root)).toEqual([
      'Subgraph "ledger" is defined more than once, so the server serves only the last. Rename the others.',
    ]);
  });

  it("warns on a model the server refuses, without any subgraph", async () => {
    const root = makeProject({});
    writeModel(root, "Revision", {
      globalSchema: "type RevisionState { title: String }",
    });

    expect(await lintSubgraphTypes(root)).toEqual([
      'Document model "Revision" is refused by the server: generates reserved type names: Revision.',
    ]);
  });

  it("skips a schema built from substitutions", async () => {
    const root = makeProject({
      ledger:
        'import { gql } from "graphql-tag";\nconst sdl = `type Revision { id: ID }`;\nexport const schema = gql`${sdl}`;\n',
    });

    expect(await lintSubgraphTypes(root)).toEqual([]);
  });
});
