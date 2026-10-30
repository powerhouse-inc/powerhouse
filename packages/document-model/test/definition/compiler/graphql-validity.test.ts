import { buildSchema, validateSchema } from "graphql";
import { describe, expect, it } from "vitest";
import type {
  AnyFieldDescriptor,
  AnyTypeDescriptor,
} from "../../../src/definition/dsl/types.js";
import {
  defineDocumentModel,
  materialize,
  ph,
} from "../../../src/definition/index.js";
import { diagnosticsOf } from "../helpers/diagnostics.js";

function probe(options: {
  readonly state: AnyTypeDescriptor;
  readonly input?: Readonly<Record<string, AnyFieldDescriptor>>;
}) {
  const context = defineDocumentModel({
    id: "test/probe",
    name: "Probe",
    description: "",
    extension: "probe",
    version: 1,
    author: { name: "Powerhouse" },
    specifications: {
      global: { schema: options.state as never, initialValue: {} as never },
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
  return materialize(context.version({ modules: [main] }));
}

function storedSegments(model: ReturnType<typeof probe>): string[] {
  const stored = model.documentModel.global.specifications[0];
  return [
    stored.state.global.schema,
    ...stored.modules.flatMap((module) =>
      module.operations.map((operation) => operation.schema ?? ""),
    ),
  ];
}

function schemaErrors(model: ReturnType<typeof probe>): string[] {
  const schema = buildSchema(
    [...storedSegments(model), "type Query { state: ProbeState }"].join("\n"),
  );
  return validateSchema(schema).map((error) => error.message);
}

function refusal(run: () => unknown) {
  return diagnosticsOf(run).map(({ code, path, message }) => ({
    code,
    path,
    message,
  }));
}

const plainState = () =>
  ph.object("ProbeState", { fields: { x: ph.String() } });

describe("deprecated input fields", () => {
  it("refuses a deprecated required operation input field", () => {
    expect(
      refusal(() =>
        probe({
          state: plainState(),
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
        probe({ state: plainState(), input: { nested: ph.ref(Nested) } }),
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
    const model = probe({
      state: plainState(),
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
    probe({
      state: ph.object("ProbeState", { fields: { item: ph.ref(item) } }),
    });
  const ITEM_PATH = ["specifications", "global", "schema", "fields", "item"];

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
    const Node = ph.interface("Node", { fields: { label: ph.String() } });
    const Holder = ph.interface("Holder", {
      fields: { node: ph.ref(Node), nodes: ph.list(ph.ref(Node)) },
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
    expect(storedSegments(model)[0]).toBe(
      "type ProbeState {\n  item: Item\n}\n\ntype Item implements Holder {\n  node: Leaf!\n  nodes: [Leaf!]!\n}\n\ninterface Holder {\n  node: Node\n  nodes: [Node]\n}\n\ninterface Node {\n  label: String\n}\n\ntype Leaf implements Node {\n  label: String!\n}\n",
    );
    expect(schemaErrors(model)).toStrictEqual([]);
  });
});

describe("input object cycles", () => {
  const opInput = ["modules", 0, "operations", 0, "input", "fields"];

  it("refuses an input that contains itself through a non-null field", () => {
    const Node = ph.input("NodeInput", {
      fields: {
        child: ph.ref((): AnyTypeDescriptor => Node, { required: true }),
      },
    });
    expect(
      diagnosticsOf(() =>
        probe({ state: plainState(), input: { node: ph.ref(Node) } }),
      ).map(({ code, path, message, related }) => ({
        code,
        path,
        message,
        related: related?.map((entry) => entry.path),
      })),
    ).toStrictEqual([
      {
        code: "PH-DM-INPUT-CYCLE",
        path: [...opInput, "node", "fields", "child"],
        message:
          'Input NodeInput contains itself through the non-null fields "child", so no finite value satisfies it.',
        related: undefined,
      },
    ]);
  });

  it("reports a cycle through two inputs once, at its first field", () => {
    const Left: AnyTypeDescriptor = ph.input("LeftInput", {
      fields: { right: ph.ref(() => Right, { required: true }) },
    });
    const Right: AnyTypeDescriptor = ph.input("RightInput", {
      fields: { left: ph.ref(() => Left, { required: true }) },
    });
    expect(
      diagnosticsOf(() =>
        probe({ state: plainState(), input: { left: ph.ref(Left) } }),
      ).map(({ code, path, message, related }) => ({
        code,
        path,
        message,
        related: related?.map((entry) => entry.path),
      })),
    ).toStrictEqual([
      {
        code: "PH-DM-INPUT-CYCLE",
        path: [...opInput, "left", "fields", "right"],
        message:
          'Input LeftInput contains itself through the non-null fields "right.left", so no finite value satisfies it.',
        related: [[...opInput, "left", "fields", "right", "fields", "left"]],
      },
    ]);
  });

  it("accepts a cycle broken by a nullable field or a list", () => {
    const Nullable: AnyTypeDescriptor = ph.input("NullableInput", {
      fields: { child: ph.ref(() => Nullable) },
    });
    const Listed: AnyTypeDescriptor = ph.input("ListedInput", {
      fields: {
        children: ph.list(
          ph.ref(() => Listed, { required: true }),
          {
            required: true,
          },
        ),
      },
    });
    const model = probe({
      state: plainState(),
      input: {
        nullable: ph.ref(Nullable, { required: true }),
        listed: ph.ref(Listed, { required: true }),
      },
    });
    expect(schemaErrors(model)).toStrictEqual([]);
  });
});

describe("scalar names", () => {
  const stateField = ["specifications", "global", "schema", "fields"];
  const refusalOf = (run: () => unknown) =>
    diagnosticsOf(run).map(({ code, path, message }) => ({
      code,
      path,
      message,
    }));
  const catalogCollision = (item: string) => ({
    code: "PH-DEF-NAME-INVALID",
    path: [...stateField, item],
    message:
      'GraphQL name "DateTime" is the catalog scalar DateTime, which every host declares, so a named type cannot take it.',
  });

  it("reserves a catalog scalar name after the scalar's use", () => {
    const Collision = ph.object("DateTime", { fields: { nested: ph.Int() } });
    expect(
      refusalOf(() =>
        probe({
          state: ph.object("ProbeState", {
            fields: { date: ph.DateTime(), item: ph.ref(Collision) },
          }),
        }),
      ),
    ).toStrictEqual([catalogCollision("item")]);
  });

  it("reserves a catalog scalar name before the scalar's use", () => {
    const Collision = ph.object("DateTime", { fields: { nested: ph.Int() } });
    expect(
      refusalOf(() =>
        probe({
          state: ph.object("ProbeState", {
            fields: { item: ph.ref(Collision), date: ph.DateTime() },
          }),
        }),
      ),
    ).toStrictEqual([catalogCollision("item")]);
  });

  it("reserves a catalog scalar name the model never uses as a scalar", () => {
    const Collision = ph.object("DateTime", { fields: { nested: ph.Int() } });
    expect(
      refusalOf(() =>
        probe({
          state: ph.object("ProbeState", {
            fields: { item: ph.ref(Collision) },
          }),
        }),
      ),
    ).toStrictEqual([catalogCollision("item")]);
  });

  it("reserves a built-in GraphQL scalar name", () => {
    const Collision = ph.enum("String", { values: ["A"] });
    expect(
      refusalOf(() =>
        probe({
          state: ph.object("ProbeState", {
            fields: { title: ph.String(), item: ph.ref(Collision) },
          }),
        }),
      ),
    ).toStrictEqual([
      {
        code: "PH-DEF-NAME-INVALID",
        path: [...stateField, "item"],
        message:
          'GraphQL name "String" is a built-in GraphQL scalar, so a named type cannot take it.',
      },
    ]);
  });
});
