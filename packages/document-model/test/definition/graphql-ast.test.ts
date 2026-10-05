import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  DefinitionDiagnostic,
  NamedGraphQLTypeDefinition,
} from "@powerhousedao/shared/document-model";
import { parse, print } from "graphql";
import { describe, expect, it, vi } from "vitest";
import { DocumentModelDefinitionError } from "../../src/definition/diagnostics.js";
import { ph } from "../../src/definition/field.js";
import {
  checkGraphQLDocumentAgreement,
  documentModelGraphQLProjection,
  validateLocationFreeDocument,
} from "../../src/definition/graphql-ast.js";
import { defineDocumentModel } from "../../src/definition/model.js";
import type * as PrinterModule from "../../src/definition/printer.js";
import { printSchemaSegment } from "../../src/definition/printer.js";
import {
  canonicalDigest,
  canonicalJson,
} from "../../src/definition/primitives.js";
import { schemaFirstGraphQLDocument } from "../../src/definition/tooling/graphql-document.js";
import { Compat, COMPAT_DOCUMENT } from "./fixtures/compat-model.js";
import { Invoice } from "./fixtures/invoice.js";

// A pass-through spy, so compilation behaves exactly as it does unmocked and
// the projection can still prove which path it took.
vi.mock("../../src/definition/printer.js", async (importOriginal) => {
  const actual = await importOriginal<typeof PrinterModule>();
  return {
    ...actual,
    printSchemaSegment: vi.fn(actual.printSchemaSegment),
  };
});

const here = dirname(fileURLToPath(import.meta.url));

const SDL = [
  "schema {",
  "  query: Query",
  "}",
  "",
  "directive @sensitive(reason: String) on FIELD_DEFINITION",
  "",
  '"The compat state root."',
  "type CompatState {",
  "  title: String!",
  '  secret: String @sensitive(reason: "pii")',
  "}",
  "",
  "extend type CompatState {",
  "  extra: Int",
  "}",
  "",
  "input SetTitleInput {",
  "  title: String!",
  "}",
].join("\n");

/** Everything the compatibility declaration's descriptors represent. */
function descriptorDefinitions(): readonly NamedGraphQLTypeDefinition[] {
  const specification = Compat.definition.specifications.at(0);
  return [
    ...(specification?.types ?? []),
    ...(specification?.modules.flatMap((module) =>
      module.operations.flatMap((operation) =>
        operation.input === null ? [] : [operation.input],
      ),
    ) ?? []),
  ];
}

function diagnosticsOf(run: () => unknown): readonly DefinitionDiagnostic[] {
  try {
    run();
  } catch (error) {
    if (error instanceof DocumentModelDefinitionError) return error.diagnostics;
    throw error;
  }
  throw new Error("expected a DocumentModelDefinitionError");
}

describe("the schema-first GraphQL document helper", () => {
  it("round-trips every type-system form in source order", () => {
    const compatibility = schemaFirstGraphQLDocument([SDL]);
    expect(compatibility.kind).toBe("graphql-ast-v1");
    expect(compatibility.preserveDefinitionOrder).toBe(true);
    expect(
      compatibility.document.definitions.map((definition) => definition.kind),
    ).toStrictEqual([
      "SchemaDefinition",
      "DirectiveDefinition",
      "ObjectTypeDefinition",
      "ObjectTypeExtension",
      "InputObjectTypeDefinition",
    ]);
    // parse -> location-free AST -> print produces the same normalized text.
    const normalized = print(parse(SDL));
    expect(print(compatibility.document as never)).toBe(normalized);
  });

  it("returns an AST the canonical encoder accepts", () => {
    const compatibility = schemaFirstGraphQLDocument([SDL]);
    expect(() => canonicalJson(compatibility)).not.toThrow();
    expect(canonicalDigest(compatibility)).toBe(
      canonicalDigest(schemaFirstGraphQLDocument([SDL])),
    );
    expect(JSON.stringify(compatibility)).not.toContain('"loc"');
    expect(
      validateLocationFreeDocument(compatibility.document, ["document"]),
    ).toStrictEqual([]);
  });

  it("keeps the segments in their concatenation order", () => {
    const split = schemaFirstGraphQLDocument([
      "type A { id: ID! }",
      "type B { id: ID! }",
    ]);
    expect(
      split.document.definitions.map((definition) =>
        "name" in definition ? definition.name.value : undefined,
      ),
    ).toStrictEqual(["A", "B"]);
  });

  it("rejects an AST that kept its locations or holds a function", () => {
    expect(
      validateLocationFreeDocument({ kind: "Document", loc: {} }, ["document"]),
    ).toHaveLength(1);
    const withFunction = validateLocationFreeDocument(
      { kind: "Document", definitions: [{ visit: () => undefined }] },
      ["document"],
    );
    expect(withFunction[0]?.code).toBe("PH-DM-COMPATIBILITY-INVALID");
    expect(withFunction[0]?.received).toBe("function");
  });
});

describe("a declaration that carries a compatibility AST", () => {
  it("finalizes from literal AST data with no tooling import", () => {
    const source = readFileSync(
      resolve(here, "fixtures/compat-model.ts"),
      "utf8",
    );
    const imports = [...source.matchAll(/from\s+"([^"]+)"/g)].map(
      (match) => match[1],
    );
    expect(imports).toStrictEqual([
      "@powerhousedao/shared/document-model",
      "../../../src/definition/field.js",
      "../../../src/definition/model.js",
    ]);
    // No generated file completes the declaration.
    expect(source).not.toContain(".graphql");
    expect(
      Compat.definition.specifications[0]?.graphQLCompatibility,
    ).toStrictEqual(COMPAT_DOCUMENT);
  });

  it("projects GraphQL from the AST without calling the descriptor printer", () => {
    const specification = Compat.definition.specifications.at(0);
    if (specification === undefined) throw new Error("no specification");
    const printer = vi.mocked(printSchemaSegment);
    printer.mockClear();
    const projection = documentModelGraphQLProjection(specification);
    expect(printer).not.toHaveBeenCalled();
    expect(projection).toStrictEqual({
      kind: "graphql-ast-v1",
      document: COMPAT_DOCUMENT.document,
    });

    // A descriptor model projects through the printer instead.
    const descriptorSpecification = Invoice.definition.specifications.at(0);
    if (descriptorSpecification === undefined) throw new Error("no spec");
    const descriptorProjection = documentModelGraphQLProjection(
      descriptorSpecification,
    );
    expect(descriptorProjection.kind).toBe("descriptor-sdl");
    expect(printer).toHaveBeenCalled();
    const segments =
      "segments" in descriptorProjection ? descriptorProjection.segments : [];
    expect(segments.join("\n")).toContain("type InvoiceState {");
    expect(segments.join("\n")).toContain("input AddLineItemInput {");
  });

  it("rejects a field nullability difference, naming the coordinate", () => {
    const diagnostics = diagnosticsOf(() =>
      defineDocumentModel({
        id: "test/compat-mismatch",
        name: "Compat",
        description: "",
        extension: "compat",
        version: 1,
        author: { name: "Powerhouse" },
        specifications: {
          graphQLCompatibility: COMPAT_DOCUMENT,
          global: {
            schema: ph.object("CompatState", {
              description: "The compat state root.",
              fields: {
                title: ph.String({ required: true }),
                // The AST declares `secret: String`.
                secret: ph.String({ required: true }),
              },
            }),
            initialValue: { title: "", secret: "" },
          },
          local: { schema: null, initialValue: {} },
        },
      }).finalize({ modules: [] }),
    );
    const mismatch = diagnostics.find(
      (diagnostic) => diagnostic.code === "PH-DM-COMPATIBILITY-INVALID",
    );
    expect(mismatch?.path).toStrictEqual([
      "specifications",
      "graphQLCompatibility",
      "document",
      "CompatState",
      "fields",
      "secret",
      "type",
    ]);
    expect(mismatch?.expected).toBe("String!");
    expect(mismatch?.received).toBe("String");
  });

  it("rejects a descriptor type the AST does not declare", () => {
    const diagnostics = checkGraphQLDocumentAgreement({
      compatibility: COMPAT_DOCUMENT,
      definitions: [
        {
          kind: "object",
          name: "Missing",
          description: null,
          fields: [],
        },
      ],
      path: ["specifications", "graphQLCompatibility"],
    });
    expect(diagnostics[0]?.message).toContain("Missing");
    expect(diagnostics[0]?.received).toBe("absent");
  });

  it("rejects an AST type that no descriptor represents", () => {
    const ghost = schemaFirstGraphQLDocument([
      SDL,
      "type Ghost { id: ID! }",
      "enum GhostKind { REAL SPECTRAL }",
    ]);
    const diagnostics = checkGraphQLDocumentAgreement({
      compatibility: ghost,
      definitions: descriptorDefinitions(),
      path: ["specifications", "graphQLCompatibility"],
    });
    expect(
      diagnostics.map((diagnostic) => diagnostic.path.at(-1)),
    ).toStrictEqual(["Ghost", "GhostKind"]);
    expect(diagnostics[0]?.code).toBe("PH-DM-COMPATIBILITY-INVALID");
    expect(diagnostics[0]?.received).toBe("ObjectTypeDefinition");
    expect(diagnostics[0]?.repair).toContain("auxiliaryTypes");
    // A root operation type stays legal: a descriptor cannot express a root,
    // and the host owns those coordinates.
    const withRoots = schemaFirstGraphQLDocument([
      SDL,
      "type Query { compat: CompatState }",
      "type Mutation { setTitle(input: SetTitleInput!): Int }",
      "schema { query: Query, mutation: Mutation }",
    ]);
    expect(
      checkGraphQLDocumentAgreement({
        compatibility: withRoots,
        definitions: descriptorDefinitions(),
        path: [],
      }),
    ).toStrictEqual([]);

    // A schema definition, a directive definition, a directive use, and a
    // type extension stay legal: the SDL fixture carries all four.
    expect(
      checkGraphQLDocumentAgreement({
        compatibility: COMPAT_DOCUMENT,
        definitions: descriptorDefinitions(),
        path: [],
      }),
    ).toStrictEqual([]);
  });

  it("rejects a malformed compatibility declaration", () => {
    expect(
      checkGraphQLDocumentAgreement({
        compatibility: {
          kind: "graphql-ast-v2" as never,
          document: COMPAT_DOCUMENT.document,
          preserveDefinitionOrder: true,
        },
        definitions: [],
        path: [],
      })[0]?.repair,
    ).toContain("schemaFirstGraphQLDocument");
    expect(
      checkGraphQLDocumentAgreement({
        compatibility: {
          kind: "graphql-ast-v1",
          document: {} as never,
          preserveDefinitionOrder: true,
        },
        definitions: [],
        path: [],
      })[0]?.message,
    ).toContain("location-free Document node");
  });

  it("keeps the runtime agreement path free of graphql", () => {
    const seen = new Set<string>();
    const bare = new Set<string>();
    const visit = (file: string): void => {
      if (seen.has(file)) return;
      seen.add(file);
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(/from\s+"([^"]+)"/g)) {
        const specifier = match[1];
        if (!specifier.startsWith(".")) {
          bare.add(specifier);
          continue;
        }
        visit(resolve(dirname(file), specifier.replace(/\.js$/, ".ts")));
      }
    };
    for (const entry of [
      "graphql-ast.ts",
      "structured.ts",
      "model.ts",
      "materialize.ts",
    ]) {
      visit(resolve(here, "../../src/definition", entry));
    }
    expect(
      [...bare].filter((specifier) => /^graphql(\/|$)/.test(specifier)),
    ).toStrictEqual([]);
    // The tooling helper is the one place that parses.
    expect(
      readFileSync(
        resolve(here, "../../src/definition/tooling/graphql-document.ts"),
        "utf8",
      ),
    ).toContain('from "graphql"');
    expect(
      seen.has(
        resolve(here, "../../src/definition/tooling/graphql-document.ts"),
      ),
    ).toBe(false);
  });
});
