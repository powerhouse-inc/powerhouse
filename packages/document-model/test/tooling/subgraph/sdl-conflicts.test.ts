import type { DefinitionDiagnostic } from "@powerhousedao/shared/document-model";
import { describe, expect, it } from "vitest";
import { ph } from "../../../src/definition/index.js";
import { readSubgraphDefinitions } from "../../../src/definition/tooling/subgraph/read.js";
import {
  schemaFirstSdlConflicts,
  type SchemaFirstSubgraphSource,
} from "../../../src/definition/tooling/subgraph/schema-first/sdl-conflicts.js";
import { codeFirst } from "./fixture.js";

const Item = ph.object("Item", {
  fields: { id: ph.OID({ required: true }), label: ph.String() },
});

const codeFirstItems = readSubgraphDefinitions({
  ItemsSubgraph: codeFirst("items", (schema) => [
    schema.query("items", {
      type: ph.list(ph.ref(Item, { required: true }), { required: true }),
      resolve: () => [],
    }),
  ]),
}).subgraphs;

function schemaFirst(
  text: string | null,
  options: {
    readonly name?: string;
    readonly language?: SchemaFirstSubgraphSource["language"];
  } = {},
): SchemaFirstSubgraphSource {
  const language = options.language ?? "typescript";
  return {
    unit: "./subgraphs/sdl/",
    name: options.name ?? "sdl",
    source: {
      specifier:
        language === "graphql"
          ? "./subgraphs/sdl/schema.graphql"
          : "./subgraphs/sdl/schema.ts",
    },
    language,
    text,
  };
}

const conflicts = (...sources: SchemaFirstSubgraphSource[]) =>
  schemaFirstSdlConflicts({ codeFirst: codeFirstItems, schemaFirst: sources });

const summary = (diagnostics: readonly DefinitionDiagnostic[]) =>
  diagnostics.map(({ code, severity, received }) => ({
    code,
    severity,
    received,
  }));

const schemaModule = (sdl: string) =>
  `import { gql } from "graphql-tag";\nexport const schema = gql\`\n${sdl}\n\`;\n`;

describe("schemaFirstSdlConflicts", () => {
  it("warns on a shared root field, a differently defined type and a shared name", () => {
    const warnings = conflicts(
      schemaFirst(
        schemaModule(
          "type Item { id: OID! }\ntype Query { items: [Item!]! other: String }",
        ),
        { name: "items" },
      ),
    );
    expect(summary(warnings)).toEqual([
      {
        code: "PH-SG-SCHEMA-FIRST-CONFLICT",
        severity: "warning",
        received: "items",
      },
      {
        code: "PH-SG-SCHEMA-FIRST-CONFLICT",
        severity: "warning",
        received: "Query.items",
      },
      {
        code: "PH-SG-SCHEMA-FIRST-CONFLICT",
        severity: "warning",
        received: "Item",
      },
    ]);
  });

  it("accepts an identical type in SDL, and reads a schema.graphql file", () => {
    const sdl =
      '"""An item."""\ntype Item {\n  label: String\n  id: OID!\n}\ntype Query { sdlItems: [Item] }';
    expect(conflicts(schemaFirst(schemaModule(sdl)))).toEqual([]);
    expect(conflicts(schemaFirst(sdl, { language: "graphql" }))).toEqual([]);
  });

  it("folds extensions of a type before comparing it", () => {
    const sdl =
      "type Item { id: OID! }\nextend type Item { label: String }\ntype Query { sdlItems: [Item] }";
    expect(conflicts(schemaFirst(schemaModule(sdl)))).toEqual([]);
  });

  it.each([
    [
      "an interpolated template",
      schemaFirst(
        'import { gql } from "graphql-tag";\nconst t = "Item";\nexport const schema = gql`type ${t} { id: ID }`;',
      ),
      "its gql template interpolates values",
    ],
    [
      "SDL imported from another module",
      schemaFirst('export { schema } from "./shared/schema.js";'),
      "its SDL is imported from another module",
    ],
    [
      "a module without a template",
      schemaFirst("export const schema = buildSchema();"),
      "it holds no gql template",
    ],
    [
      "a missing file",
      schemaFirst(null),
      "the subgraph has no schema.graphql, schema.ts or index.ts",
    ],
  ])("reports %s as not checked", (_, source, reason) => {
    expect(summary(conflicts(source))).toEqual([
      {
        code: "PH-SG-SCHEMA-FIRST-UNCHECKED",
        severity: "warning",
        received: reason,
      },
    ]);
  });

  it("reports SDL that does not parse as not checked", () => {
    const [warning] = conflicts(schemaFirst(schemaModule("type Query {")));
    expect(warning.code).toBe("PH-SG-SCHEMA-FIRST-UNCHECKED");
    expect(warning.received).toMatch(/^its SDL does not parse: Syntax Error/);
  });

  it("checks nothing without a code-first subgraph", () => {
    expect(
      schemaFirstSdlConflicts({
        codeFirst: [],
        schemaFirst: [schemaFirst(null)],
      }),
    ).toEqual([]);
  });
});
