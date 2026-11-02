import type {
  DirectiveUseDefinition,
  FieldDefinition,
  LocationFreeGraphQLDocumentNode,
  NamedGraphQLTypeDefinition,
  SchemaFirstGraphQLDocumentCompatibility,
  TypeReferenceDefinition,
} from "@powerhousedao/shared/document-model";
import { parse, print } from "graphql";
import { describe, expect, it } from "vitest";
import {
  checkGraphQLDocumentAgreement,
  validateLocationFreeDocument,
} from "../../../src/definition/kernel/graphql-ast.js";
import { printSchemaSegment } from "../../../src/definition/kernel/printer.js";
import { canonicalJson } from "../../../src/definition/kernel/primitives.js";

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

function withoutLocations(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutLocations);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key, member]) => key !== "loc" && member !== undefined)
      .map(([key, member]) => [key, withoutLocations(member)]),
  );
}

function compatibility(
  segments: readonly string[],
): SchemaFirstGraphQLDocumentCompatibility {
  return {
    kind: "graphql-ast-v1",
    document: withoutLocations(
      parse(segments.join("\n"), { noLocation: true }),
    ) as LocationFreeGraphQLDocumentNode,
    preserveDefinitionOrder: true,
  };
}

function scalar(name: string, required = false): TypeReferenceDefinition {
  return { kind: "scalar", name, required };
}

function field(
  name: string,
  type: TypeReferenceDefinition,
  directives?: readonly DirectiveUseDefinition[],
): FieldDefinition {
  return {
    key: name,
    name,
    description: null,
    deprecated: null,
    type,
    ...(directives && { directives }),
  };
}

function compatState(
  fields: readonly FieldDefinition[] = [
    field("title", scalar("String", true)),
    field("secret", scalar("String")),
    field("extra", scalar("Int")),
  ],
): NamedGraphQLTypeDefinition {
  return {
    kind: "object",
    name: "CompatState",
    description: "The compat state root.",
    fields,
  };
}

const setTitleInput: NamedGraphQLTypeDefinition = {
  kind: "input",
  name: "SetTitleInput",
  description: null,
  unknownKeys: "reject",
  fields: [field("title", scalar("String", true))],
};

const COMPAT = compatibility([SDL]);
const PATH = ["specifications", "graphQLCompatibility"];

function equals(value: string): readonly DirectiveUseDefinition[] {
  return [{ name: "equals", arguments: [{ name: "value", value }] }];
}

describe("validateLocationFreeDocument", () => {
  it("accepts a parsed document stripped of its locations", () => {
    expect(validateLocationFreeDocument(COMPAT.document, ["document"])).toEqual(
      [],
    );
    expect(() => canonicalJson(COMPAT)).not.toThrow();
    expect(print(COMPAT.document as never)).toBe(print(parse(SDL)));
  });

  it("rejects an AST that kept its locations or holds a function", () => {
    expect(
      validateLocationFreeDocument({ kind: "Document", loc: {} }, ["document"]),
    ).toStrictEqual([
      expect.objectContaining({
        code: "PH-DEF-COMPATIBILITY-INVALID",
        path: ["document", "loc"],
        received: "loc",
      }),
    ]);
    const withFunction = validateLocationFreeDocument(
      { kind: "Document", definitions: [{ visit: () => undefined }] },
      ["document"],
    );
    expect(withFunction).toStrictEqual([
      expect.objectContaining({
        code: "PH-DEF-COMPATIBILITY-INVALID",
        path: ["document", "definitions", 0, "visit"],
        received: "function",
      }),
    ]);
  });
});

describe("validateLocationFreeDocument on values outside JSON", () => {
  const refusal = (value: unknown) =>
    validateLocationFreeDocument(value, ["document"]).map(
      ({ code, path, received }) => ({ code, path, received }),
    );

  it("reads data properties without running an accessor", () => {
    let reads = 0;
    const document = {
      kind: "Document",
      get definitions() {
        reads += 1;
        return [];
      },
    };
    expect(refusal(document)).toStrictEqual([
      {
        code: "PH-DEF-COMPATIBILITY-INVALID",
        path: ["document", "definitions"],
        received: "accessor",
      },
    ]);
    expect(reads).toBe(0);
  });

  it("refuses an array property that is not an item, without reading it", () => {
    let reads = 0;
    const definitions: unknown[] = [];
    Object.defineProperty(definitions, "forEach", {
      enumerable: true,
      get() {
        reads += 1;
        return Array.prototype.forEach;
      },
    });
    expect(refusal({ kind: "Document", definitions })).toStrictEqual([
      {
        code: "PH-DEF-COMPATIBILITY-INVALID",
        path: ["document", "definitions", "forEach"],
        received: "forEach",
      },
    ]);
    expect(reads).toBe(0);
  });

  it("refuses a cycle, a non-finite number, a hole and a class instance", () => {
    const cyclic: Record<string, unknown> = { kind: "Document" };
    cyclic.self = cyclic;
    expect(refusal(cyclic)).toStrictEqual([
      {
        code: "PH-DEF-COMPATIBILITY-INVALID",
        path: ["document", "self"],
        received: "cycle",
      },
    ]);
    const holey = new Array<number>(3);
    holey[0] = 1;
    holey[2] = 3;
    expect(refusal({ a: Number.NaN, b: holey, c: new Date(0) })).toStrictEqual([
      {
        code: "PH-DEF-COMPATIBILITY-INVALID",
        path: ["document", "a"],
        received: "NaN",
      },
      {
        code: "PH-DEF-COMPATIBILITY-INVALID",
        path: ["document", "b", 1],
        received: "hole",
      },
      {
        code: "PH-DEF-COMPATIBILITY-INVALID",
        path: ["document", "c"],
        received: "object",
      },
    ]);
  });
});

describe("checkGraphQLDocumentAgreement", () => {
  it("accepts definitions that agree with the AST, extensions and directives included", () => {
    expect(
      checkGraphQLDocumentAgreement({
        compatibility: COMPAT,
        definitions: [compatState(), setTitleInput],
        path: PATH,
      }),
    ).toStrictEqual([]);
  });

  it("accepts the explicit empty input the printer projects", () => {
    const empty: NamedGraphQLTypeDefinition = {
      kind: "input",
      name: "EmptyInput",
      description: null,
      unknownKeys: "reject",
      fields: [],
    };
    const printed = printSchemaSegment([empty]);
    expect(printed).toBe("input EmptyInput {\n  _empty: Boolean\n}\n");
    expect(
      checkGraphQLDocumentAgreement({
        compatibility: compatibility([printed]),
        definitions: [empty],
        path: PATH,
      }),
    ).toStrictEqual([]);
  });

  it("rejects a field nullability difference, naming the coordinate", () => {
    const diagnostics = checkGraphQLDocumentAgreement({
      compatibility: COMPAT,
      definitions: [
        compatState([
          field("title", scalar("String", true)),
          field("secret", scalar("String", true)),
          field("extra", scalar("Int")),
        ]),
        setTitleInput,
      ],
      path: PATH,
    });
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({
      code: "PH-DEF-COMPATIBILITY-INVALID",
      path: [...PATH, "document", "CompatState", "fields", "secret", "type"],
      expected: "String!",
      received: "String",
    });
  });

  describe("@equals, the one directive use that validates", () => {
    const check = (
      directives: readonly DirectiveUseDefinition[] | undefined,
      pattern = "abc",
    ) =>
      checkGraphQLDocumentAgreement({
        compatibility: compatibility([
          `type EqualsState { code: String @equals(value: ${JSON.stringify(pattern)}) }`,
        ]),
        definitions: [
          {
            kind: "object",
            name: "EqualsState",
            description: null,
            fields: [field("code", scalar("String"), directives)],
          },
        ],
        path: PATH,
      }).map(({ code, path, expected, received, repair }) => ({
        code,
        path: path.slice(PATH.length + 1),
        expected,
        received,
        repair,
      }));

    it("accepts the same pattern", () => {
      expect(check(equals("abc"))).toStrictEqual([]);
    });

    it("rejects a missing or different pattern", () => {
      const mismatch = {
        code: "PH-DEF-COMPATIBILITY-INVALID",
        path: ["EqualsState", "fields", "code", "equals"],
        received: '@equals(value: "abc")',
        repair:
          'Give the definition of EqualsState.code @equals(value: "abc").',
      };
      expect(check(undefined)).toStrictEqual([
        { ...mismatch, expected: "no @equals" },
      ]);
      expect(check(equals("abd"))).toStrictEqual([
        { ...mismatch, expected: '@equals(value: "abd")' },
      ]);
    });

    it("rejects an AST pattern the generator cannot write", () => {
      expect(check(undefined, "a$'b")[0]?.code).toBe("PH-DEF-OPTION-INVALID");
      expect(check(undefined, "a/b")).toStrictEqual([
        {
          code: "PH-DEF-OPTION-INVALID",
          path: ["EqualsState", "fields", "code", "equals"],
          expected:
            "a regular expression pattern the generator can write as /^pattern$/",
          received: "a/b",
          repair:
            'Escape the slash as \\/ (written "\\\\/" in a JavaScript string), or put it in a character class such as [/].',
        },
      ]);
    });
  });

  it("rejects a descriptor type the AST does not declare", () => {
    const diagnostics = checkGraphQLDocumentAgreement({
      compatibility: COMPAT,
      definitions: [
        compatState(),
        setTitleInput,
        { kind: "object", name: "Missing", description: null, fields: [] },
      ],
      path: PATH,
    });
    expect(diagnostics).toStrictEqual([
      expect.objectContaining({
        path: [...PATH, "document", "Missing"],
        expected: "Missing",
        received: "absent",
      }),
    ]);
  });

  it("rejects an AST type that no descriptor represents, except a root operation type", () => {
    const diagnostics = checkGraphQLDocumentAgreement({
      compatibility: compatibility([
        SDL,
        "type Ghost { id: ID! }",
        "enum GhostKind { REAL SPECTRAL }",
      ]),
      definitions: [compatState(), setTitleInput],
      path: PATH,
    });
    expect(diagnostics.map((diagnostic) => diagnostic.path.at(-1))).toEqual([
      "Ghost",
      "GhostKind",
    ]);
    expect(diagnostics[0]).toMatchObject({
      code: "PH-DEF-COMPATIBILITY-INVALID",
      received: "ObjectTypeDefinition",
    });
    expect(
      checkGraphQLDocumentAgreement({
        compatibility: compatibility([
          SDL,
          "type Query { compat: CompatState }",
          "type Mutation { setTitle(input: SetTitleInput!): Int }",
          "schema { query: Query, mutation: Mutation }",
        ]),
        definitions: [compatState(), setTitleInput],
        path: [],
      }),
    ).toStrictEqual([]);
  });

  it("rejects a malformed compatibility declaration", () => {
    expect(
      checkGraphQLDocumentAgreement({
        compatibility: { ...COMPAT, kind: "graphql-ast-v2" as never },
        definitions: [],
        path: [],
      }),
    ).toStrictEqual([
      expect.objectContaining({
        code: "PH-DEF-COMPATIBILITY-INVALID",
        path: ["kind"],
        received: "graphql-ast-v2",
      }),
    ]);
    expect(
      checkGraphQLDocumentAgreement({
        compatibility: { ...COMPAT, document: {} as never },
        definitions: [],
        path: [],
      })[0]?.message,
    ).toBe(
      "A GraphQL compatibility document must be a location-free Document node.",
    );
  });
});
