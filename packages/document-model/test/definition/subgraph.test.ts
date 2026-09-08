import type { LocationFreeGraphQLDocumentNodeV1 } from "@powerhousedao/shared/document-model";
import { describe, expect, it, vi } from "vitest";
import { ph } from "../../src/definition/field.js";
import type { DefinitionDiagnosticError } from "../../src/definition/diagnostics.js";
import { buildNamedTypeDefinitions } from "../../src/definition/subgraph/ast.js";
import { createSubgraphDefiner } from "../../src/definition/subgraph/compiler.js";

type Args = {
  readonly service: { readonly prefix: string };
  readonly path?: string;
};
type Request = { readonly headers: Record<string, string> };
type TestResolver = (...args: unknown[]) => unknown;

class FakeBase {
  name = "base";
  path = "";
  typeDefs: LocationFreeGraphQLDocumentNodeV1 = {
    kind: "Document",
    definitions: [],
  };
  resolvers: Record<string, unknown> = {};
  hasSubscriptions?: boolean;
  readonly service: Args["service"];

  constructor(args: Args) {
    this.service = args.service;
    this.path = args.path ?? "";
  }

  async onSetup() {}
}

const defineTestSubgraph = createSubgraphDefiner<
  Args,
  Request,
  LocationFreeGraphQLDocumentNodeV1,
  { readonly fieldName: string },
  { readonly name: string },
  FakeBase,
  typeof FakeBase
>(FakeBase);

const Greeting = ph.object("Greeting", {
  fields: {
    id: ph.ID({ required: true }),
    message: ph.field({
      args: { punctuation: ph.String() },
      returns: ph.String({ required: true }),
    }),
  },
});

describe("host-agnostic subgraph compiler", () => {
  it("renders enum-typed input defaults as GraphQL enum values", () => {
    const definitions = buildNamedTypeDefinitions([
      {
        kind: "enum",
        name: "Status",
        description: null,
        values: [
          {
            name: "OPEN",
            description: null,
            deprecated: null,
          },
        ],
      },
      {
        kind: "input",
        name: "Filter",
        description: null,
        unknownKeys: "preserve",
        fields: [
          {
            key: "status",
            name: "status",
            description: null,
            deprecated: null,
            type: {
              kind: "named",
              name: "Status",
              required: false,
            },
            defaultValue: "OPEN",
          },
          {
            key: "statuses",
            name: "statuses",
            description: null,
            deprecated: null,
            type: {
              kind: "list",
              required: false,
              item: {
                kind: "named",
                name: "Status",
                required: false,
              },
            },
            defaultValue: "OPEN",
          },
        ],
      },
    ]);
    const input = definitions.find(
      ({ kind }) => kind === "InputObjectTypeDefinition",
    );

    expect(input?.kind).toBe("InputObjectTypeDefinition");
    if (input?.kind !== "InputObjectTypeDefinition") {
      throw new Error("Expected the Filter input definition.");
    }
    expect(input.fields[0]?.defaultValue).toEqual({
      kind: "EnumValue",
      value: "OPEN",
    });
    expect(input.fields[1]?.defaultValue).toEqual({
      kind: "EnumValue",
      value: "OPEN",
    });
  });

  it("adds collision-free placeholders to empty structured types", () => {
    const definitions = buildNamedTypeDefinitions([
      {
        kind: "interface",
        name: "EmptyNode",
        description: null,
        fields: [],
      },
      {
        kind: "interface",
        name: "EmptyChild",
        description: null,
        implements: ["EmptyNode"],
        fields: [],
      },
      {
        kind: "object",
        name: "Implementation",
        description: null,
        implements: ["EmptyChild"],
        fields: [
          {
            key: "_phEmptyEmptyNode",
            name: "_phEmptyEmptyNode",
            description: null,
            deprecated: null,
            type: { kind: "scalar", name: "String", required: false },
          },
        ],
      },
      {
        kind: "input",
        name: "EmptyInput",
        description: null,
        unknownKeys: "reject",
        fields: [],
      },
      {
        kind: "object",
        name: "EmptyObject",
        description: null,
        fields: [],
      },
    ]);
    const fields = Object.fromEntries(
      definitions.flatMap((definition) =>
        "fields" in definition
          ? [
              [
                definition.name.value,
                definition.fields.map((field) => field.name.value),
              ],
            ]
          : [],
      ),
    );

    expect(fields).toEqual({
      EmptyNode: ["_phEmptyEmptyNode_2"],
      EmptyChild: ["_phEmptyEmptyNode_2", "_phEmptyEmptyChild"],
      Implementation: [
        "_phEmptyEmptyNode",
        "_phEmptyEmptyChild",
        "_phEmptyEmptyNode_2",
      ],
      EmptyInput: ["_phEmpty"],
      EmptyObject: ["_phEmpty"],
    });
    const implementation = definitions.find(
      (definition) =>
        definition.kind === "ObjectTypeDefinition" &&
        definition.name.value === "Implementation",
    );
    expect(
      implementation?.kind === "ObjectTypeDefinition"
        ? implementation.interfaces.map((type) => type.name.value)
        : [],
    ).toEqual(["EmptyChild", "EmptyNode"]);
  });

  it("compiles typed entries and injects the host subgraph", async () => {
    const setup = vi.fn();
    const resolverCalls: unknown[] = [];
    const Subgraph = defineTestSubgraph({
      name: "greetings",
      schemaKind: "typed",
      onSetup: setup,
      entries: (b) => [
        b.query("greeting", {
          args: { id: ph.ID({ required: true }) },
          returns: ph.ref(Greeting, { required: true }),
          resolve(call) {
            resolverCalls.push(call);
            return { id: call.args.id };
          },
        }),
        b.field(Greeting.computed.message, {
          resolve: ({ parent, args, subgraph }) =>
            `${subgraph.service.prefix}${parent.id}${args.punctuation ?? ""}`,
        }),
      ],
    });

    expect(Subgraph.definition).toMatchObject({
      kind: "powerhouse.subgraph",
      formatVersion: 1,
      name: "greetings",
      schemaKind: "typed",
      hasSubscriptions: false,
    });
    expect(Object.isFrozen(Subgraph.definition)).toBe(true);
    expect(
      Subgraph.definition.schemaKind === "typed" && Subgraph.definition.entries,
    ).toHaveLength(2);
    expect(
      Subgraph.definition.schemaKind === "typed" &&
        Subgraph.definition.entries.map((entry) =>
          "access" in entry ? entry.access : null,
        ),
    ).toEqual([{ kind: "manual" }, { kind: "manual" }]);

    const instance = new Subgraph({
      service: { prefix: "hello:" },
      path: "/api",
    });
    expect(instance).toBeInstanceOf(FakeBase);
    expect(instance.path).toBe("/api");
    expect(instance.name).toBe("greetings");
    expect(instance.typeDefs.definitions.map((item) => item.kind)).toEqual([
      "ObjectTypeDefinition",
      "ObjectTypeDefinition",
    ]);

    const query = (instance.resolvers.Query as Record<string, TestResolver>)
      .greeting;
    const request = { headers: { authorization: "test" } };
    const info = { fieldName: "greeting" };
    expect(query(null, { id: "one" }, request, info)).toEqual({
      id: "one",
    });
    expect(resolverCalls).toHaveLength(1);
    expect(resolverCalls[0]).toMatchObject({
      parent: null,
      args: { id: "one" },
      request,
      info,
    });
    expect(resolverCalls[0]).not.toHaveProperty("access");
    expect((resolverCalls[0] as { readonly subgraph: unknown }).subgraph).toBe(
      instance,
    );

    const field = (instance.resolvers.Greeting as Record<string, TestResolver>)
      .message;
    expect(
      field({ id: "two" }, { punctuation: "!" }, request, {
        fieldName: "message",
      }),
    ).toBe("hello:two!");
    await instance.onSetup();
    expect(setup).toHaveBeenCalledWith({
      subgraph: instance,
    });
  });

  it("preserves compatibility AST and binds the runtime subgraph", () => {
    const legacyTypeDefs = {
      kind: "Document" as const,
      loc: { start: 0, end: 26 },
      definitions: [
        {
          kind: "ObjectTypeDefinition" as const,
          loc: { start: 0, end: 26 },
          name: { kind: "Name" as const, value: "Query", loc: {} },
          interfaces: [],
          directives: [],
          fields: [
            {
              kind: "FieldDefinition" as const,
              name: { kind: "Name" as const, value: "hello", loc: {} },
              arguments: [],
              type: {
                kind: "NamedType" as const,
                name: { kind: "Name" as const, value: "String", loc: {} },
              },
              directives: [],
              loc: {},
            },
          ],
        },
      ],
    };
    const resolver = () => "hello";
    const getResolvers = vi.fn(() => ({ Query: { hello: resolver } }));
    const Subgraph = defineTestSubgraph({
      name: "legacy-shape",
      schemaKind: "graphql-ast-compat",
      compatibility: {
        kind: "graphql-ast-v1",
        typeDefs:
          legacyTypeDefs as unknown as LocationFreeGraphQLDocumentNodeV1,
        getResolvers,
        hasSubscriptions: undefined,
        preserveDefinitionOrder: true,
      },
    });

    expect(getResolvers).toHaveBeenCalledOnce();
    expect(JSON.stringify(Subgraph.definition)).not.toContain("loc");
    expect(Subgraph.definition).toMatchObject({
      schemaKind: "graphql-ast-compat",
      hasSubscriptions: null,
      resolverCoordinates: [
        {
          typeName: "Query",
          fieldName: "hello",
          resolverKind: "field",
        },
      ],
    });

    const instance = new Subgraph({ service: { prefix: "" } });
    expect(getResolvers).toHaveBeenCalledTimes(2);
    expect(getResolvers).toHaveBeenLastCalledWith({ subgraph: instance });
    expect(instance.typeDefs).toBe(legacyTypeDefs);
    expect(instance.hasSubscriptions).toBeUndefined();
    expect(
      (instance.resolvers.Query as Record<string, TestResolver>).hello(),
    ).toBe("hello");
  });

  it("passes the GraphQL isTypeOf arguments without an abstract-type placeholder", () => {
    const calls: unknown[] = [];
    const Entity = ph.object("Entity", {
      fields: { id: ph.ID({ required: true }) },
    });
    const Subgraph = defineTestSubgraph({
      name: "type-check",
      schemaKind: "typed",
      entries: (b) => [
        b.isTypeOf(Entity, (call) => {
          calls.push(call);
          return true;
        }),
      ],
    });
    const instance = new Subgraph({ service: { prefix: "" } });
    const isTypeOf = (instance.resolvers.Entity as Record<string, TestResolver>)
      .__isTypeOf;
    const value = { id: "one" };
    const request = { headers: {} };
    const info = { fieldName: "__isTypeOf" };

    expect(isTypeOf(value, request, info)).toBe(true);
    expect(calls).toEqual([{ value, subgraph: instance, request, info }]);
  });

  it("rejects non-JSON values in a compatibility AST", () => {
    expect(() =>
      defineTestSubgraph({
        name: "invalid-ast",
        schemaKind: "graphql-ast-compat",
        compatibility: {
          kind: "graphql-ast-v1",
          typeDefs: {
            kind: "Document",
            definitions: [],
            invalid: Number.NaN,
          } as unknown as LocationFreeGraphQLDocumentNodeV1,
          getResolvers: () => ({}),
          hasSubscriptions: false,
          preserveDefinitionOrder: true,
        },
      }),
    ).toThrowError(
      expect.objectContaining<Partial<DefinitionDiagnosticError>>({
        code: "PH-GQL-AST-NON-JSON",
        path: ["compatibility", "typeDefs", "invalid"],
      }),
    );
  });

  it("rejects compatibility AST accessors without invoking them", () => {
    const getter = vi.fn(() => "ObjectTypeDefinition");
    const definition = {};
    Object.defineProperty(definition, "kind", {
      enumerable: true,
      get: getter,
    });

    expect(() =>
      defineTestSubgraph({
        name: "accessor-ast",
        schemaKind: "graphql-ast-compat",
        compatibility: {
          kind: "graphql-ast-v1",
          typeDefs: {
            kind: "Document",
            definitions: [definition],
          } as unknown as LocationFreeGraphQLDocumentNodeV1,
          getResolvers: () => ({}),
          hasSubscriptions: false,
          preserveDefinitionOrder: true,
        },
      }),
    ).toThrowError(
      expect.objectContaining<Partial<DefinitionDiagnosticError>>({
        code: "PH-GQL-AST-NON-JSON",
        path: ["compatibility", "typeDefs", "definitions", 0, "kind"],
      }),
    );
    expect(getter).not.toHaveBeenCalled();
  });

  it("rejects resolver-map accessors without invoking them", () => {
    const getter = vi.fn(() => () => "unsafe");
    const query = {};
    Object.defineProperty(query, "hello", {
      enumerable: true,
      get: getter,
    });

    expect(() =>
      defineTestSubgraph({
        name: "accessor-resolvers",
        schemaKind: "graphql-ast-compat",
        compatibility: {
          kind: "graphql-ast-v1",
          typeDefs: {
            kind: "Document",
            definitions: [],
          },
          getResolvers: () => ({ Query: query }),
          hasSubscriptions: false,
          preserveDefinitionOrder: true,
        },
      }),
    ).toThrowError(
      expect.objectContaining<Partial<DefinitionDiagnosticError>>({
        code: "PH-GQL-RESOLVER-MAP-INVALID",
        path: ["compatibility", "getResolvers", "Query", "hello"],
      }),
    );
    expect(getter).not.toHaveBeenCalled();
  });

  it("rejects author access options, missing computed resolvers, and typed Federation declarations", () => {
    expect(() =>
      defineTestSubgraph({
        name: "author-access",
        schemaKind: "typed",
        entries: (b) => [
          b.query("authorAccess", {
            returns: ph.String(),
            access: { kind: "public" },
            resolve: () => "unsupported",
          } as never),
        ],
      }),
    ).toThrowError(
      expect.objectContaining<Partial<DefinitionDiagnosticError>>({
        code: "PH-GQL-CONFIG-OPTION-UNSUPPORTED",
        path: ["entries", "authorAccess", "access"],
      }),
    );

    expect(() =>
      defineTestSubgraph({
        name: "missing-field",
        schemaKind: "typed",
        entries: (b) => [
          b.query("greeting", {
            returns: ph.ref(Greeting),
            resolve: () => ({ id: "one" }),
          }),
        ],
      }),
    ).toThrowError(
      expect.objectContaining<Partial<DefinitionDiagnosticError>>({
        code: "PH-GQL-COMPUTED-FIELD-RESOLVER-MISSING",
      }),
    );

    expect(() =>
      defineTestSubgraph({
        name: "federated",
        schemaKind: "typed",
        entries: (b) => [
          b.query("_service", {
            returns: ph.String(),
            resolve: () => "unsupported",
          }),
        ],
      }),
    ).toThrowError(
      expect.objectContaining<Partial<DefinitionDiagnosticError>>({
        code: "PH-GQL-FEDERATION-UNSUPPORTED",
      }),
    );

    const hiddenArgument = Symbol("hidden-argument");
    expect(() =>
      defineTestSubgraph({
        name: "symbol-argument",
        schemaKind: "typed",
        entries: (b) => [
          b.query("symbolArgument", {
            args: {
              id: ph.ID(),
              [hiddenArgument]: ph.String(),
            } as never,
            returns: ph.String(),
            resolve: () => "unsupported",
          }),
        ],
      }),
    ).toThrowError(
      expect.objectContaining<Partial<DefinitionDiagnosticError>>({
        code: "PH-GQL-SYMBOL-KEY-UNSUPPORTED",
        path: ["entries", "symbolArgument", "args"],
      }),
    );

    expect(() =>
      defineTestSubgraph({
        name: "forged-entry",
        schemaKind: "typed",
        entries: () =>
          [{ __powerhouseSubgraphEntry: true, entryKind: "type" }] as never,
      }),
    ).toThrowError(
      expect.objectContaining<Partial<DefinitionDiagnosticError>>({
        code: "PH-GQL-ENTRY-INVALID",
      }),
    );

    expect(() =>
      defineTestSubgraph({
        name: "forged-computed-token",
        schemaKind: "typed",
        entries: (b) => [
          b.field(
            {
              kind: "computed-field-token",
              objectName: "Greeting",
              key: "message",
            } as never,
            { resolve: () => "forged" },
          ),
        ],
      }),
    ).toThrowError(
      expect.objectContaining<Partial<DefinitionDiagnosticError>>({
        code: "PH-GQL-COMPUTED-FIELD-TOKEN-INVALID",
      }),
    );

    expect(() =>
      defineTestSubgraph({
        name: "forged-field",
        schemaKind: "typed",
        entries: (b) => [
          b.query("forged", {
            returns: { role: "field use", kind: "scalar" },
            resolve: () => "forged",
          } as never),
        ],
      }),
    ).toThrowError(
      expect.objectContaining<Partial<DefinitionDiagnosticError>>({
        code: "PH-GQL-FIELD-DESCRIPTOR-INVALID",
      }),
    );

    expect(() =>
      defineTestSubgraph({
        name: "forged-type",
        schemaKind: "typed",
        entries: (b) =>
          [
            b.type({
              role: "named type; wrap it with ph.ref(Type) to use it as a field",
              kind: "object",
              name: "Forged",
            } as never),
          ] as const,
      }),
    ).toThrowError(
      expect.objectContaining<Partial<DefinitionDiagnosticError>>({
        code: "PH-GQL-TYPE-DESCRIPTOR-INVALID",
      }),
    );
  });
});
