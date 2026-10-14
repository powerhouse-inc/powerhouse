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

const schemaFile = (sdl: string) =>
  `import { gql } from "graphql-tag";\n\nexport const schema = gql\`\n${sdl}\n\`;\n`;

const template = (pascalCaseName: string, camelCaseName: string) =>
  customSubgraphSchemaTemplate({ pascalCaseName, camelCaseName });

describe("lintSubgraphTypes", () => {
  it("is silent on the template under a name of its own", () => {
    const root = makeProject({
      "subgraph-tools": template("SubgraphTools", "subgraphTools"),
    });

    expect(lintSubgraphTypes(root)).toEqual([]);
  });

  it("warns on a subgraph named like the package's model subgraph", () => {
    const root = makeProject({
      "subgraph-module": template("SubgraphModule", "subgraphModule"),
    });

    expect(lintSubgraphTypes(root)).toEqual([
      'Subgraph "subgraph-module" has the name of a document model subgraph, so the server refuses it. Rename the subgraph.',
    ]);
  });

  it("reads the subgraph's name from its index.ts", () => {
    const root = makeProject({ tools: template("Tools", "tools") });
    writeFileSync(
      join(root, "subgraphs", "tools", "index.ts"),
      'export class ToolsSubgraph extends BaseSubgraph {\n  name = "system";\n}\n',
    );

    expect(lintSubgraphTypes(root)).toEqual([
      'Subgraph "system" has the name of a core subgraph, so the server refuses it. Rename the subgraph.',
    ]);
  });

  it("warns on a type the package's model subgraph generates", () => {
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

    expect(lintSubgraphTypes(root)).toEqual([
      'Subgraph "tools" defines SubgraphModuleQueries differently from "subgraph-module", which owns it, so the server leaves it out of the supergraph. Rename SubgraphModuleQueries in this subgraph, or define it exactly as "subgraph-module" does.',
    ]);
  });

  it("warns on core and reserved types", () => {
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

    expect(lintSubgraphTypes(root)).toEqual([
      'Subgraph "ledger" defines Operation, which the document-model schema generates, so the server refuses it. Rename those types in this subgraph.',
    ]);
  });

  it("warns on a root field another of the package's subgraphs serves", () => {
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

    expect(lintSubgraphTypes(root)).toEqual([
      'Subgraphs "ledger" and "ledger-copy" both define Query.ledger, and the supergraph can include only one of them. Define Query.ledger in one subgraph only.',
    ]);
  });

  it("groups the subgraphs that define a contested type the same way", () => {
    const gadget = (sdl: string, field: string) =>
      schemaFile(`type Query { ${field}: Gadget } ${sdl}`);
    const root = makeProject({
      alpha: gadget("type Gadget { id: ID! }", "a"),
      beta: gadget("type Gadget { id: ID! }", "b"),
      gamma: gadget("type Gadget { id: ID! size: Int }", "c"),
    });

    expect(lintSubgraphTypes(root)).toEqual([
      'Gadget is defined one way by "alpha" and "beta", and another way by "gamma". The supergraph can include the subgraphs of only one of these definitions. Make every definition of Gadget identical, or rename it where it differs.',
    ]);
  });

  it("warns that the server serves only one of two subgraphs with one name", () => {
    const root = makeProject({
      first: schemaFile("type Query { a: String }"),
      second: schemaFile("type Query { b: String }"),
    });
    for (const dir of ["first", "second"]) {
      writeFileSync(
        join(root, "subgraphs", dir, "index.ts"),
        'export class LedgerSubgraph { name = "ledger"; }\n',
      );
    }

    expect(lintSubgraphTypes(root)).toEqual([
      'Subgraphs in "first" and "second" are both named "ledger", so the server serves only one of them. Rename one of them.',
    ]);
  });

  it("warns that the server refuses a model whose schema does not build, and checks the rest", () => {
    const root = makeProject({
      "subgraph-module": template("SubgraphModule", "subgraphModule"),
    });
    const brokenDir = join(root, "document-models", "broken");
    mkdirSync(brokenDir, { recursive: true });
    writeFileSync(
      join(brokenDir, "broken.json"),
      JSON.stringify({
        id: "test/broken",
        name: "Broken",
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
                    schema: "input BrokenInput {",
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
              global: { schema: "", initialValue: "", examples: [] },
              local: { schema: "", initialValue: "", examples: [] },
            },
          },
        ],
      }),
    );

    expect(lintSubgraphTypes(root)).toEqual([
      expect.stringMatching(
        /^The server refuses document model "Broken": it has an unusable schema: [\s\S]+\. Fix the document model's state and operation schemas so they build\.$/,
      ),
      'Subgraph "subgraph-module" has the name of a document model subgraph, so the server refuses it. Rename the subgraph.',
    ]);
  });

  it("warns that the server does not serve a subgraph whose schema does not build, and leaves it out of the claims", () => {
    const root = makeProject({
      broken: schemaFile("type Query { shared: Missing }"),
      working: schemaFile("type Query { shared: String }"),
    });

    expect(lintSubgraphTypes(root)).toEqual([
      'Subgraph "broken" does not build, so the server does not serve it: Unknown type "Missing". Fix its schema so it builds, or declare the missing type.',
    ]);
  });

  it("skips a schema built from substitutions", () => {
    const root = makeProject({
      ledger:
        'import { gql } from "graphql-tag";\nconst sdl = `type Revision { id: ID }`;\nexport const schema = gql`${sdl}`;\n',
    });

    expect(lintSubgraphTypes(root)).toEqual([]);
  });
});
