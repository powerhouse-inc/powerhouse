import { describe, expect, expectTypeOf, it } from "vitest";
import type {
  InputFieldDefinition,
  ResolverCoordinateDefinition,
  SubgraphDefinition,
  SubgraphEntryDefinition,
  SubgraphScalarReferenceDefinition,
} from "./definition-types.js";

describe("hasSubscriptions", () => {
  it("can be null in the compatibility variant", () => {
    const compat: SubgraphDefinition = {
      kind: "powerhouse.subgraph",
      formatVersion: 1,
      name: "reactor-drive",
      compositionPolicy: "host-current",
      federationProfile: "host-current",
      schemaKind: "graphql-ast-compat",
      hasSubscriptions: null,
      document: { kind: "Document", definitions: [] },
      resolverCoordinates: [],
      access: "manual",
    };
    expect(compat.hasSubscriptions).toBeNull();
  });

  it("cannot be null in the typed variant", () => {
    type Typed = Extract<SubgraphDefinition, { schemaKind: "typed" }>;
    expectTypeOf<Typed["hasSubscriptions"]>().toEqualTypeOf<boolean>();
    type Compat = Extract<
      SubgraphDefinition,
      { schemaKind: "graphql-ast-compat" }
    >;
    expectTypeOf<Compat["hasSubscriptions"]>().toEqualTypeOf<boolean | null>();
  });
});

describe("argument defaults", () => {
  it("distinguish absent from an explicit null", () => {
    const absent: InputFieldDefinition = {
      key: "first",
      name: "first",
      description: null,
      deprecated: null,
      type: { kind: "scalar", name: "Int", required: false },
    };
    const explicitNull: InputFieldDefinition = {
      key: "after",
      name: "after",
      description: null,
      deprecated: null,
      type: { kind: "scalar", name: "String", required: false },
      defaultValue: null,
    };
    expect("defaultValue" in absent).toBe(false);
    expect("defaultValue" in explicitNull).toBe(true);
    expect(explicitNull.defaultValue).toBeNull();
  });
});

describe("the entry union", () => {
  it("is closed, and every entry is manual", () => {
    const entries: readonly SubgraphEntryDefinition[] = [
      {
        kind: "query",
        key: "reactorDrive",
        fieldName: "reactorDrive",
        description: null,
        deprecated: null,
        args: [],
        returns: { kind: "named", name: "ReactorDrive", required: false },
        access: { kind: "manual" },
      },
      {
        kind: "mutation",
        key: "addNode",
        fieldName: "addNode",
        description: null,
        deprecated: null,
        args: [],
        returns: { kind: "named", name: "Node", required: true },
        access: { kind: "manual" },
      },
      {
        kind: "subscription",
        key: "nodeChanged",
        fieldName: "nodeChanged",
        description: null,
        deprecated: null,
        args: [],
        returns: { kind: "named", name: "Node", required: true },
        access: { kind: "manual" },
      },
      {
        kind: "computed-field",
        typeName: "ReactorDriveFolderNode",
        fieldName: "children",
        access: { kind: "manual" },
      },
      {
        kind: "resolve-type",
        typeName: "ReactorDriveNode",
        access: { kind: "manual" },
      },
      {
        kind: "is-type-of",
        typeName: "ReactorDriveFileNode",
        access: { kind: "manual" },
      },
    ];
    expect(entries.map((entry) => entry.kind)).toEqual([
      "query",
      "mutation",
      "subscription",
      "computed-field",
      "resolve-type",
      "is-type-of",
    ]);
    expectTypeOf<SubgraphEntryDefinition["access"]>().toEqualTypeOf<{
      readonly kind: "manual";
    }>();
  });
});

describe("a typed definition", () => {
  const definition: SubgraphDefinition = {
    kind: "powerhouse.subgraph",
    formatVersion: 1,
    name: "example",
    compositionPolicy: "host-current",
    federationProfile: "host-current",
    schemaKind: "typed",
    hasSubscriptions: false,
    types: [
      {
        kind: "object",
        name: "Example",
        description: null,
        fields: [
          {
            key: "id",
            name: "id",
            description: null,
            deprecated: null,
            type: { kind: "scalar", name: "OID", required: true },
          },
        ],
      },
    ],
    entries: [
      {
        kind: "query",
        key: "example",
        fieldName: "example",
        description: null,
        deprecated: null,
        args: [],
        returns: { kind: "named", name: "Example", required: false },
        access: { kind: "manual" },
      },
    ],
    scalars: [
      {
        name: "OID",
        implementation: "powerhouse.catalog#OID",
        graphQLProfile: "legacy-graphql-default-v1",
      },
    ],
    definitionOrder: ["OID", "Example", "Query"],
  };

  it("carries no function anywhere", () => {
    const walk = (value: unknown, path: string): void => {
      expect(typeof value, path).not.toBe("function");
      if (Array.isArray(value)) {
        value.forEach((item, index) => walk(item, `${path}[${index}]`));
      } else if (value !== null && typeof value === "object") {
        for (const [key, item] of Object.entries(value)) {
          walk(item, `${path}.${key}`);
        }
      }
    };
    walk(definition, "$");
    expect(JSON.parse(JSON.stringify(definition))).toStrictEqual(definition);
  });

  it("records every emitted name once, roots and scalars included", () => {
    expect(new Set(definition.definitionOrder).size).toBe(
      definition.definitionOrder.length,
    );
    expect(definition.definitionOrder).toContain("Query");
    expect(definition.definitionOrder).toContain("OID");
  });
});

describe("a scalar reference", () => {
  it("names the catalog implementation and the host profile", () => {
    const reference: SubgraphScalarReferenceDefinition = {
      name: "Amount_Money",
      implementation: "powerhouse.catalog#Amount_Money",
      graphQLProfile: "legacy-graphql-default-v1",
    };
    expect(reference.implementation).toBe("powerhouse.catalog#Amount_Money");
  });

  it("requires the implementation to match the catalog scalar name", () => {
    type PHIDReference = Extract<
      SubgraphScalarReferenceDefinition,
      { name: "PHID" }
    >;
    expectTypeOf<
      PHIDReference["implementation"]
    >().toEqualTypeOf<"powerhouse.catalog#PHID">();
    expectTypeOf<{
      readonly name: "PHID";
      readonly implementation: "powerhouse.catalog#OID";
      readonly graphQLProfile: "legacy-graphql-default-v1";
    }>().not.toExtend<SubgraphScalarReferenceDefinition>();
    expectTypeOf<{
      readonly name: "PHID";
      readonly implementation: "powerhouse.catalog#does-not-exist";
      readonly graphQLProfile: "legacy-graphql-default-v1";
    }>().not.toExtend<SubgraphScalarReferenceDefinition>();
  });
});

describe("a resolver coordinate", () => {
  it("uses a null field name for a type-level resolver", () => {
    const coordinates: readonly ResolverCoordinateDefinition[] = [
      { typeName: "Query", fieldName: "reactorDrive", resolverKind: "field" },
      {
        typeName: "ReactorDriveNode",
        fieldName: null,
        resolverKind: "resolveType",
      },
    ];
    expect(coordinates[1].fieldName).toBeNull();
  });
});
