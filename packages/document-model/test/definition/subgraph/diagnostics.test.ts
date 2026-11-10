import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineScalar } from "../../../src/scalars/define-scalar.js";
import {
  compileSubgraph,
  createSubgraphEntryBuilders,
  ph,
  type SubgraphCompilation,
} from "../../../src/definition/index.js";
import { registerFieldDescriptor } from "../../../src/definition/dsl/descriptor-registry.js";
import {
  Card,
  Filter,
  Invoice,
  Line,
  Node,
  Payment,
  Status,
} from "./fixture.js";

const schema = createSubgraphEntryBuilders<unknown, unknown, unknown>();
const none = () => null;
const hello = schema.query("hello", { type: ph.String(), resolve: none });

const codes = (result: SubgraphCompilation<unknown, unknown, unknown>) =>
  result.diagnostics.map(({ code, path }) => [code, path.join(".")]);

describe("compileSubgraph diagnostics", () => {
  it.each([
    { name: "Invoices", compiled: undefined, bindings: 0 },
    { name: "invoice_payments", compiled: undefined, bindings: 0 },
    { name: "-invoices", compiled: undefined, bindings: 0 },
    { name: "invoices-", compiled: undefined, bindings: 0 },
    { name: "", compiled: undefined, bindings: 0 },
    { name: "2fa", compiled: undefined, bindings: 0 },
    { name: "invoice-v2", compiled: "invoice-v2", bindings: 1 },
  ])(
    "checks the name $name without normalizing it",
    ({ name, compiled, bindings }) => {
      const result = compileSubgraph({ name, entries: [hello] });
      expect([
        result.definition?.name,
        result.bindings.size,
        result.diagnostics.map(({ code, severity, definition, path }) => [
          code,
          severity,
          definition,
          path.join("."),
        ]),
      ]).toStrictEqual([
        compiled,
        bindings,
        compiled === undefined
          ? [
              [
                "PH-SG-NAME-INVALID",
                "error",
                { kind: "subgraph", key: name },
                "name",
              ],
            ]
          : [],
      ]);
    },
  );

  it("refuses an empty entry list and values the builders did not make", () => {
    expect([
      codes(compileSubgraph({ name: "shop", entries: [] })),
      codes(
        compileSubgraph({
          name: "shop",
          entries: [
            hello,
            { kind: "query" },
            Object.freeze({ ...hello }),
          ] as never,
        }),
      ),
    ]).toStrictEqual([
      [["PH-SG-ENTRY-INVALID", "entries"]],
      [
        ["PH-SG-ENTRY-INVALID", "entries.1"],
        ["PH-SG-ENTRY-INVALID", "entries.2"],
      ],
    ]);
  });

  it("reports malformed entry options at the entry", () => {
    const entries = [
      schema.query("noType", { resolve: none } as never),
      schema.query("bad name", { type: ph.String(), resolve: none }),
      schema.query("extra", {
        type: ph.String(),
        resolve: none,
        cache: 1,
      } as never),
      schema.query("rawType", { type: ph.String, resolve: none } as never),
      schema.query("badArgs", {
        args: { "x-y": ph.String() },
        type: ph.String(),
        resolve: none,
      } as never),
    ];
    expect(codes(compileSubgraph({ name: "shop", entries }))).toStrictEqual([
      ["PH-SG-ENTRY-INVALID", "entries.0.spec.type"],
      ["PH-DEF-NAME-INVALID", "entries.1.name"],
      ["PH-DEF-OPTION-INVALID", "entries.2.spec.cache"],
      ["PH-SCALAR-FACTORY-AS-FIELD", "entries.3.spec.type"],
      ["PH-DEF-NAME-INVALID", "entries.4.spec.args.x-y"],
    ]);
  });

  it("reports a missing resolve, subscribe or resolveType instead of throwing", () => {
    const entries = [
      schema.query("noResolve", { type: ph.String() } as never),
      schema.mutation("notAFunction", {
        type: ph.String(),
        resolve: 1,
      } as never),
      schema.subscription("noSubscribe", { type: ph.String() } as never),
      schema.query("payment", { type: ph.ref(Payment), resolve: none }),
      schema.field(Card, "masked", { type: ph.String() } as never),
      schema.resolveType(Payment, undefined as never),
    ];
    const result = compileSubgraph({ name: "shop", entries });
    expect(codes(result)).toStrictEqual([
      ["PH-SG-RESOLVER-MISSING", "entries.0.spec.resolve"],
      ["PH-SG-RESOLVER-MISSING", "entries.1.spec.resolve"],
      ["PH-SG-RESOLVER-MISSING", "entries.2.spec.subscribe"],
      ["PH-SG-RESOLVER-MISSING", "entries.4.spec.resolve"],
      ["PH-SG-RESOLVER-MISSING", "entries.5.resolveType"],
    ]);
    expect(result.diagnostics[1]?.message).toBe(
      'mutation "notAFunction" has no resolve function.',
    );
  });

  it("refuses a coordinate bound twice", () => {
    const entries = [
      hello,
      schema.query("hello", { type: ph.Int(), resolve: none }),
      schema.query("line", { type: ph.ref(Line), resolve: none }),
      schema.field(Line, "amount", { type: ph.Float(), resolve: none }),
      schema.field(Line, "doubled", { type: ph.Float(), resolve: none }),
      schema.field(Line, "doubled", { type: ph.Float(), resolve: none }),
      schema.query("payment", { type: ph.ref(Payment), resolve: none }),
      schema.resolveType(Payment, () => "CardPayment"),
      schema.resolveType(Payment, () => "CardPayment"),
    ];
    const result = compileSubgraph({ name: "shop", entries });
    expect(codes(result)).toStrictEqual([
      ["PH-SG-DUPLICATE-COORDINATE", "entries.1"],
      ["PH-SG-DUPLICATE-COORDINATE", "entries.3.name"],
      ["PH-SG-DUPLICATE-COORDINATE", "entries.5"],
      ["PH-SG-DUPLICATE-COORDINATE", "entries.8"],
    ]);
    expect(result.diagnostics[0]?.related).toStrictEqual([
      { path: ["entries", 0], message: "First bound here." },
    ]);
  });

  it("refuses a computed field whose parent is not a reached object type", () => {
    const entries = [
      hello,
      schema.field(Invoice, "total", { type: ph.Float(), resolve: none }),
      schema.field(Node as never, "kind", { type: ph.String(), resolve: none }),
    ];
    const result = compileSubgraph({ name: "shop", entries });
    expect(codes(result)).toStrictEqual([
      ["PH-SG-FIELD-PARENT-INVALID", "entries.1.parent"],
      ["PH-SG-FIELD-PARENT-INVALID", "entries.2.parent"],
    ]);
    expect(result.diagnostics.map(({ received }) => received)).toStrictEqual([
      "Invoice",
      'interface "Node"',
    ]);
  });

  it("refuses resolveType on a non-abstract or unreached type", () => {
    const entries = [
      schema.query("line", { type: ph.ref(Line), resolve: none }),
      schema.resolveType(Line as never, () => "InvoiceLine"),
      schema.resolveType(Payment, () => "CardPayment"),
    ];
    expect(codes(compileSubgraph({ name: "shop", entries }))).toStrictEqual([
      ["PH-SG-RESOLVE-TYPE-INVALID", "entries.1.type"],
      ["PH-SG-RESOLVE-TYPE-INVALID", "entries.2.type"],
    ]);
  });

  it("warns about an interface that no object type of the subgraph implements", () => {
    const entries = [
      schema.query("node", { type: ph.ref(Node), resolve: none }),
      schema.type(Status),
    ];
    const result = compileSubgraph({ name: "shop", entries });
    expect(codes(result)).toStrictEqual([
      ["PH-SG-INTERFACE-UNIMPLEMENTED", "types.Node"],
    ]);
    expect(result.diagnostics[0]?.repair).toBe(
      "Add schema.type(<Implementer>) for each object type that implements Node.",
    );
    expect(
      codes(
        compileSubgraph({
          name: "shop",
          entries: [...entries, schema.type(Invoice)],
        }),
      ),
    ).toStrictEqual([]);
  });

  it("refuses schema.type for a value that is not a named type", () => {
    expect(
      codes(
        compileSubgraph({
          name: "shop",
          entries: [hello, schema.type(ph.String() as never)],
        }),
      ),
    ).toStrictEqual([["PH-SG-ENTRY-INVALID", "entries.1.type"]]);
  });

  it("refuses the Query fields Apollo Federation adds", () => {
    const entries = [
      schema.query("_service", { type: ph.String(), resolve: none }),
      schema.query("_entities", { type: ph.String(), resolve: none }),
      schema.mutation("_service", { type: ph.String(), resolve: none }),
    ];
    const result = compileSubgraph({ name: "shop", entries });
    expect(codes(result)).toStrictEqual([
      ["PH-SG-FEDERATION-UNSUPPORTED", "entries.0"],
      ["PH-SG-FEDERATION-UNSUPPORTED", "entries.1"],
    ]);
    expect(result.definition).toBeUndefined();
  });

  it("refuses Apollo Federation directives", () => {
    const string = ph.String({ required: true });
    const shareable = registerFieldDescriptor(
      Object.freeze({
        ...string,
        presentation: Object.freeze({
          ...string.presentation,
          directives: [{ name: "shareable", arguments: [] }],
        }),
      }),
    );
    const Shared = ph.object("Shared", { fields: { id: shareable } });
    const entries = [
      schema.query("shared", { type: ph.ref(Shared), resolve: none }),
      schema.query("byId", {
        args: { id: shareable },
        type: ph.String(),
        resolve: none,
      }),
    ];
    const result = compileSubgraph({ name: "shop", entries });
    expect(codes(result)).toStrictEqual([
      [
        "PH-SG-FEDERATION-UNSUPPORTED",
        "types.Query.fields.byId.args.id.directives.0",
      ],
      ["PH-SG-FEDERATION-UNSUPPORTED", "types.Shared.fields.id.directives.0"],
    ]);
    expect(result.diagnostics[0]?.received).toBe("@shareable");
  });

  it.each([
    { kind: "types", name: "Query" },
    { kind: "types", name: "Mutation" },
    { kind: "types", name: "Subscription" },
    { kind: "scalars", name: "Query" },
    { kind: "scalars", name: "Mutation" },
    { kind: "scalars", name: "Subscription" },
  ])("refuses $kind named $name, a root type's name", ({ kind, name }) => {
    const type =
      kind === "types"
        ? ph.ref(ph.object(name, { fields: { id: ph.ID() } }))
        : ph.scalar(defineScalar({ name, schema: z.string() }));
    const entries = [schema.mutation("make", { type, resolve: none })];
    const result = compileSubgraph({ name: "shop", entries });
    expect([codes(result), result.diagnostics[0]?.message]).toStrictEqual([
      [["PH-DM-DUPLICATE-NAME", `${kind}.${name}`]],
      `GraphQL type name ${name} is a subgraph root type.`,
    ]);
  });

  it("refuses an object type that no entry gives a field", () => {
    const Empty = ph.object("Empty", { fields: {} });
    const entries = [
      schema.query("empty", { type: ph.ref(Empty), resolve: none }),
    ];
    const result = compileSubgraph({ name: "shop", entries });
    expect(codes(result)).toStrictEqual([
      ["PH-DM-DECLARATION-INVALID", "entries.0.fields.empty.fields"],
    ]);
    expect(result.diagnostics[0]?.message).toBe(
      'The object type "Empty" declares no fields, and GraphQL cannot build a schema that contains it.',
    );
  });

  it("checks interface conformance against computed fields", () => {
    const Named = ph.interface("Named", {
      fields: { label: ph.String({ required: true }) },
    });
    const Thing = ph.object("Thing", {
      implements: [Named],
      fields: { id: ph.ID() },
    });
    const entries = [
      schema.query("thing", { type: ph.ref(Thing), resolve: none }),
      schema.field(Thing, "label", { type: ph.Int(), resolve: none }),
    ];
    const result = compileSubgraph({ name: "shop", entries });
    expect(codes(result)).toStrictEqual([
      ["PH-DM-INTERFACE-INVALID", "entries.0.fields.thing"],
    ]);
  });

  it("refuses a computed interface field that adds a required argument", () => {
    const Named = ph.interface("Named", { fields: { label: ph.String() } });
    const Thing = ph.object("Thing", {
      implements: [Named],
      fields: { id: ph.ID() },
    });
    const entries = [
      schema.query("thing", { type: ph.ref(Thing), resolve: none }),
      schema.field(Thing, "label", {
        args: { locale: ph.String({ required: true }) },
        type: ph.String(),
        resolve: none,
      }),
    ];
    const result = compileSubgraph({ name: "shop", entries });
    expect(codes(result)).toStrictEqual([
      ["PH-DM-INTERFACE-INVALID", "entries.0.fields.thing"],
    ]);
    expect(result.diagnostics[0]?.message).toBe(
      "Thing.label has the required argument locale, which the interface field Named.label does not declare.",
    );
  });

  it("reports what the descriptor walk finds in entry types", () => {
    const Other = ph.enum("InvoiceStatus", { values: ["OPEN"] });
    const entries = [
      schema.query("filter", { type: ph.ref(Filter), resolve: none }),
      schema.query("status", { type: ph.ref(Status), resolve: none }),
      schema.query("other", { type: ph.ref(Other), resolve: none }),
    ];
    expect(codes(compileSubgraph({ name: "shop", entries }))).toStrictEqual([
      ["PH-DM-TYPE-POSITION-INVALID", "entries.0.fields.filter"],
      ["PH-DM-DUPLICATE-NAME", "entries.2.fields.other"],
    ]);
  });
});
