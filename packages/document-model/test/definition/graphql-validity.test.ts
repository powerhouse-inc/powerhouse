import type { DefinitionDiagnostic } from "@powerhousedao/shared/document-model";
import { buildSchema, validateSchema } from "graphql";
import { describe, expect, it } from "vitest";
import { DocumentModelDefinitionError } from "../../src/definition/diagnostics.js";
import { ph } from "../../src/definition/field.js";
import { defineDocumentModel } from "../../src/definition/model.js";
import { schemaFirstGraphQLDocument } from "../../src/definition/tooling/graphql-document.js";
import type {
  AnyFieldDescriptor,
  AnyTypeDescriptor,
} from "../../src/definition/types.js";

/**
 * Every refusal here mirrors a rule of graphql-js `validateSchema`, which
 * `buildSchema` alone never runs. Each accepted neighbour is therefore checked
 * against `validateSchema` over the stored segments a host assembles.
 */

function finalizeProbe(options: {
  readonly state: AnyTypeDescriptor;
  readonly initialValue?: object;
  readonly input?: Readonly<Record<string, AnyFieldDescriptor>>;
  readonly retained?: readonly string[];
}) {
  const context = defineDocumentModel({
    id: "test/probe",
    name: "Probe",
    description: "",
    extension: "probe",
    version: 1,
    author: { name: "Powerhouse" },
    specifications: {
      ...(options.retained !== undefined && {
        graphQLCompatibility: schemaFirstGraphQLDocument(options.retained),
      }),
      global: {
        schema: options.state as never,
        initialValue: (options.initialValue ?? {}) as never,
      },
      local: { schema: null, initialValue: {} },
    },
  });
  const main = context.module("main", {
    operations: ({ global }) => ({
      doIt: global({
        input: ph.input({ fields: options.input ?? { a: ph.String() } }),
        reduce() {},
      }),
    }),
  });
  return context.finalize({ modules: [main] });
}

function storedSegments(model: ReturnType<typeof finalizeProbe>): string[] {
  const stored = model.documentModel.global.specifications.at(0);
  if (stored === undefined) throw new Error("no stored specification");
  return [
    stored.state.global.schema,
    ...stored.modules.flatMap((module) =>
      module.operations.map((operation) => operation.schema ?? ""),
    ),
  ];
}

function schemaErrors(model: ReturnType<typeof finalizeProbe>): string[] {
  const schema = buildSchema(
    [...storedSegments(model), "type Query { state: ProbeState }"].join("\n"),
  );
  return validateSchema(schema).map((error) => error.message);
}

function refusal(run: () => unknown) {
  try {
    run();
  } catch (error) {
    if (!(error instanceof DocumentModelDefinitionError)) throw error;
    return error.diagnostics.map(
      ({ code, path, message }: DefinitionDiagnostic) => ({
        code,
        path,
        message,
      }),
    );
  }
  throw new Error("expected a DocumentModelDefinitionError");
}

const STATE_PATH = ["specifications", "global", "schema"];

describe("computed fields in document state", () => {
  const Item = (fields: Readonly<Record<string, unknown>>) =>
    ph.object("Item", { fields: { name: ph.String(), ...fields } as never });
  const withItems = (item: AnyTypeDescriptor) =>
    finalizeProbe({
      state: ph.object("ProbeState", {
        fields: { items: ph.list(ph.ref(item), { required: true }) },
      }),
      initialValue: { items: [] },
    });

  it("refuses a computed field on an object the state reaches", () => {
    expect(
      refusal(() =>
        withItems(
          Item({ total: ph.field({ returns: ph.Int({ required: true }) }) }),
        ),
      ),
    ).toStrictEqual([
      {
        code: "PH-SG-COMPUTED-FIELD-INVALID",
        path: [...STATE_PATH, "fields", "items", "item", "fields", "total"],
        message:
          'Field "total" of Item is computed, and a document model stores every field of its state, so no resolver could supply it.',
      },
    ]);
  });

  it("refuses a computed field on the state root", () => {
    expect(
      refusal(() =>
        finalizeProbe({
          state: ph.object("ProbeState", {
            fields: {
              title: ph.String(),
              size: ph.field({ returns: ph.Int() }),
            },
          }),
        }),
      ),
    ).toStrictEqual([
      {
        code: "PH-SG-COMPUTED-FIELD-INVALID",
        path: [...STATE_PATH, "fields", "size"],
        message:
          'Field "size" of ProbeState is computed, and a document model stores every field of its state, so no resolver could supply it.',
      },
    ]);
  });

  it("stores the same object without the computed field as a valid schema", () => {
    const model = withItems(Item({ total: ph.Int({ required: true }) }));
    expect(storedSegments(model)[0]).toBe(
      "type ProbeState {\n  items: [Item]!\n}\n\ntype Item {\n  name: String\n  total: Int!\n}\n",
    );
    expect(schemaErrors(model)).toStrictEqual([]);
  });

  it("keeps a retained state field with arguments as a stored member", () => {
    const Filter = ph.input("Filter", {
      fields: { term: ph.String({ required: true }) },
    });
    const model = finalizeProbe({
      retained: [
        "input Filter { term: String! }",
        "type ProbeState { title: String lookup(filter: Filter): String }",
        "input DoItInput { a: String }",
      ],
      state: ph.object("ProbeState", {
        fields: {
          title: ph.String(),
          lookup: ph.field({
            args: { filter: ph.ref(Filter) },
            returns: ph.String(),
          }),
        },
      }),
    });
    expect(storedSegments(model)[0]).toContain(
      "lookup(filter: Filter): String",
    );
    expect(schemaErrors(model)).toStrictEqual([]);
  });
});

describe("deprecated input fields", () => {
  it("refuses a deprecated required operation input field", () => {
    expect(
      refusal(() =>
        finalizeProbe({
          state: ph.object("ProbeState", { fields: { x: ph.String() } }),
          input: { a: ph.String({ required: true, deprecated: "gone" }) },
        }),
      ),
    ).toStrictEqual([
      {
        code: "PH-DEF-FIELD-OPTION-UNSUPPORTED",
        path: [
          "modules",
          0,
          "operations",
          0,
          "input",
          "fields",
          "a",
          "deprecated",
        ],
        message:
          "Required input field a cannot be deprecated: a caller has to supply it, so GraphQL refuses the schema.",
      },
    ]);
  });

  it("refuses a deprecated required field of a nested named input", () => {
    const Nested = ph.input("NestedInput", {
      fields: { b: ph.Int({ required: true, deprecated: "gone" }) },
    });
    expect(
      refusal(() =>
        finalizeProbe({
          state: ph.object("ProbeState", { fields: { x: ph.String() } }),
          input: { nested: ph.ref(Nested) },
        }),
      ).map(({ code, message }) => ({ code, message })),
    ).toStrictEqual([
      {
        code: "PH-DEF-FIELD-OPTION-UNSUPPORTED",
        message:
          "Required input field b cannot be deprecated: a caller has to supply it, so GraphQL refuses the schema.",
      },
    ]);
  });

  it("accepts a deprecated input field that is nullable or has a default", () => {
    const model = finalizeProbe({
      state: ph.object("ProbeState", { fields: { x: ph.String() } }),
      input: {
        a: ph.String({ deprecated: "gone" }),
        b: ph.String({ required: true, defaultValue: "b", deprecated: "gone" }),
      },
    });
    expect(storedSegments(model)[1]).toBe(
      'input DoItInput {\n  a: String @deprecated(reason: "gone")\n  b: String! = "b" @deprecated(reason: "gone")\n}\n',
    );
    expect(schemaErrors(model)).toStrictEqual([]);
  });
});

describe("interface implementations", () => {
  const Named = ph.interface("Named", {
    fields: { label: ph.String({ required: true }) },
  });
  const withItem = (item: AnyTypeDescriptor) =>
    finalizeProbe({
      state: ph.object("ProbeState", { fields: { item: ph.ref(item) } }),
    });
  const ITEM_PATH = [...STATE_PATH, "fields", "item"];

  it("refuses an object that omits an interface field", () => {
    expect(
      refusal(() =>
        withItem(
          ph.object("Item", {
            implements: [Named],
            fields: { other: ph.Int() },
          }),
        ),
      ),
    ).toStrictEqual([
      {
        code: "PH-DM-INTERFACE-INVALID",
        path: ITEM_PATH,
        message:
          "Interface field Named.label expected but Item does not provide it.",
      },
    ]);
  });

  it("refuses an object field that is not a subtype of the interface field", () => {
    expect(
      refusal(() =>
        withItem(
          ph.object("Item", {
            implements: [Named],
            fields: { label: ph.String() },
          }),
        ),
      ),
    ).toStrictEqual([
      {
        code: "PH-DM-INTERFACE-INVALID",
        path: ITEM_PATH,
        message:
          "Interface field Named.label expects type String! but Item.label is type String.",
      },
    ]);
  });

  it("refuses an object that omits an ancestor of its interface", () => {
    const Child = ph.interface("Child", {
      implements: [Named],
      fields: { label: ph.String({ required: true }) },
    });
    expect(
      refusal(() =>
        withItem(
          ph.object("Item", {
            implements: [Child],
            fields: { label: ph.String({ required: true }) },
          }),
        ),
      ),
    ).toStrictEqual([
      {
        code: "PH-DM-INTERFACE-INVALID",
        path: ITEM_PATH,
        message:
          "Type Item must implement Named because it is implemented by Child.",
      },
    ]);
  });

  it("accepts covariant field types as a valid schema", () => {
    const Node = ph.interface("Node", {
      fields: { label: ph.String() },
    });
    const Holder = ph.interface("Holder", {
      fields: {
        node: ph.ref(Node),
        nodes: ph.list(ph.ref(Node)),
      },
    });
    const Leaf = ph.object("Leaf", {
      implements: [Node],
      fields: { label: ph.String({ required: true }) },
    });
    const model = withItem(
      ph.object("Item", {
        implements: [Holder],
        fields: {
          node: ph.ref(Leaf, { required: true }),
          nodes: ph.list(ph.ref(Leaf, { required: true }), { required: true }),
        },
      }),
    );
    expect(schemaErrors(model)).toStrictEqual([]);
  });
});
