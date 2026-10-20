import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { migrateSubgraphs } from "../src/codegen/migrate-subgraphs.js";

const workspace = join(import.meta.dirname, "../../..");
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

function project(files: Record<string, string>, installed: boolean) {
  const root = mkdtempSync(join(tmpdir(), "ph-migrate-bases-"));
  roots.push(root);
  writeFileSync(join(root, "package.json"), '{"type":"module"}');
  writeFileSync(
    join(root, "tsconfig.json"),
    '{"compilerOptions":{"module":"nodenext","strict":true,"skipLibCheck":true}}',
  );
  if (installed) {
    mkdirSync(join(root, "node_modules/@powerhousedao"), { recursive: true });
    symlinkSync(
      join(workspace, "packages/reactor-api"),
      join(root, "node_modules/@powerhousedao/reactor-api"),
    );
    symlinkSync(
      join(workspace, "packages/reactor-api/node_modules/graphql-tag"),
      join(root, "node_modules/graphql-tag"),
    );
  }
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

const legacyBody = `  name = "foo";
  typeDefs = gql\`type Query { hello: String }\`;
  resolvers = { Query: { hello: () => "hi" } };
}
`;
const migratedBody = `  static override readonly subgraphName = "foo";
  static override getSchema(schemaBuilder: SchemaBuilder<FooSubgraph>) {
    return schemaBuilder.graphql({
      typeDefs: gql\`
        type Query {
          hello: String
        }
      \`,
      resolverCoordinates: [
        {
          typeName: "Query",
          fieldName: "hello",
          resolverKind: "field",
        },
      ],
      resolvers: (s) => ({ Query: { hello: () => "hi" } }),
    });
  }
}
`;
const barrel = 'export * as FooSubgraph from "./foo/index.js";\n';
const migratedBarrel = `import type { SubgraphCheck } from "@powerhousedao/reactor-api";
import { FooSubgraph as FooFooSubgraph } from "./foo/index.js";

export * as FooSubgraph from "./foo/index.js";

export { FooFooSubgraph };
const checkFooFooSubgraph: SubgraphCheck<typeof FooFooSubgraph> = true;
void checkFooFooSubgraph;
`;

describe.each([
  ["without installed dependencies", false],
  ["with installed dependencies", true],
])("ph migrate --subgraphs-only %s", (_, installed) => {
  it.each([
    [
      "a local re-export",
      {
        "subgraphs/base.ts":
          'export { BaseSubgraph } from "@powerhousedao/reactor-api";\n',
      },
      'import { BaseSubgraph } from "../base.js";\n',
      "BaseSubgraph",
      'import { BaseSubgraph } from "../base.js";\nimport { type SchemaBuilder } from "@powerhousedao/reactor-api";\n',
    ],
    [
      "a local aliased namespace re-export",
      {
        "subgraphs/base.ts":
          'export * as reactor from "@powerhousedao/reactor-api";\n',
      },
      'import { reactor as api } from "../base.js";\n',
      "api.BaseSubgraph",
      'import { reactor as api } from "../base.js";\nimport { type SchemaBuilder } from "@powerhousedao/reactor-api";\n',
    ],
    [
      "a namespace import",
      {},
      'import * as api from "@powerhousedao/reactor-api";\n',
      "api.BaseSubgraph",
      'import * as api from "@powerhousedao/reactor-api";\nimport { type SchemaBuilder } from "@powerhousedao/reactor-api";\n',
    ],
  ])(
    "converts a class extending BaseSubgraph through %s and repeats without edits",
    async (_, extra, imports, base, migratedImports) => {
      const root = project(
        {
          ...extra,
          "subgraphs/index.ts": barrel,
          "subgraphs/foo/index.ts": `import { gql } from "graphql-tag";\n${imports}\nexport class FooSubgraph extends ${base} {\n${legacyBody}`,
        },
        installed,
      );
      const leaf = join(root, "subgraphs/foo/index.ts");
      expect(await migrateSubgraphs(root)).toStrictEqual({
        changedFiles: [join(root, "subgraphs/index.ts"), leaf],
        diagnostics: [],
      });
      const migrated = `import { gql } from "graphql-tag";\n${migratedImports}\nexport class FooSubgraph extends ${base} {\n${migratedBody}`;
      expect(readFileSync(leaf, "utf8")).toBe(migrated);
      expect(readFileSync(join(root, "subgraphs/index.ts"), "utf8")).toBe(
        migratedBarrel,
      );
      expect(await migrateSubgraphs(root)).toStrictEqual({
        changedFiles: [],
        diagnostics: [],
      });
      expect(readFileSync(leaf, "utf8")).toBe(migrated);
    },
  );

  it.each([
    [
      "a call",
      'import { BaseSubgraph } from "@powerhousedao/reactor-api";\nconst withLogging = <T,>(base: T) => base;\n',
      "withLogging(BaseSubgraph)",
    ],
    [
      "a const alias",
      'import { BaseSubgraph } from "@powerhousedao/reactor-api";\nconst Base = BaseSubgraph;\n',
      "Base",
    ],
    [
      "an unresolved import",
      'import { HostedSubgraph } from "@acme/hosted-subgraph";\n',
      "HostedSubgraph",
    ],
  ])(
    "reports a class with old-style fields whose base is %s and leaves it unchanged",
    async (_, imports, base) => {
      const source = `import { gql } from "graphql-tag";\n${imports}\nexport class FooSubgraph extends ${base} {\n${legacyBody}`;
      const root = project(
        { "subgraphs/index.ts": barrel, "subgraphs/foo/index.ts": source },
        installed,
      );
      const leaf = join(root, "subgraphs/foo/index.ts");
      expect(await migrateSubgraphs(root)).toStrictEqual({
        changedFiles: [],
        diagnostics: [
          {
            file: leaf,
            line:
              source
                .split("\n")
                .indexOf(`export class FooSubgraph extends ${base} {`) + 1,
            message: `FooSubgraph declares old-style subgraph fields, but migration cannot trace its base ${base} to BaseSubgraph from @powerhousedao/reactor-api. Extend BaseSubgraph imported from @powerhousedao/reactor-api and run ph migrate again, or update it manually.`,
          },
        ],
      });
      expect(readFileSync(leaf, "utf8")).toBe(source);
    },
  );

  it("leaves classes with a name field and resolvable non-subgraph bases unchanged", async () => {
    const source = `export class FooError extends Error {\n  name = "FooError";\n}\nconst named = <T,>(base: T) => base;\nexport class BarError extends named(Error) {\n  name = "BarError";\n}\nclass Named {\n  name = "named";\n}\nexport class Child extends Named {}\n`;
    const root = project(
      { "subgraphs/index.ts": barrel, "subgraphs/foo/index.ts": source },
      installed,
    );
    expect(await migrateSubgraphs(root)).toStrictEqual({
      changedFiles: [],
      diagnostics: [],
    });
    expect(readFileSync(join(root, "subgraphs/foo/index.ts"), "utf8")).toBe(
      source,
    );
  });
});
