import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { DocumentModelSpecificationDefinition } from "@powerhousedao/shared/document-model";
import { buildSchema, validateSchema } from "graphql";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  defineDocumentModel,
  materialize,
  ph,
} from "../../../src/definition/index.js";
import type {
  AnyFieldDescriptor,
  AnyTypeDescriptor,
} from "../../../src/definition/dsl/types.js";
import { canonicalDigest } from "../../../src/definition/kernel/primitives.js";
import { scalarCatalog } from "../../../src/scalars/catalog.js";
import { defineScalar } from "../../../src/scalars/define-scalar.js";
import { Invoice, invoice } from "../fixtures/invoice.js";
import { diagnosticsOf } from "../helpers/diagnostics.js";

const here = dirname(fileURLToPath(import.meta.url));

function specificationOf(
  module: typeof Invoice,
): DocumentModelSpecificationDefinition {
  const specification = module.definition.specifications.at(0);
  if (specification === undefined) throw new Error("no specification");
  return specification;
}

function codesOf(run: () => unknown): readonly string[] {
  return diagnosticsOf(run).map((diagnostic) => diagnostic.code);
}
function tinyModel(
  options: {
    readonly id?: string;
    readonly name?: string;
    readonly globalFields?: Record<string, never> | object;
    readonly examples?: readonly { key: string; value: string }[];
  } = {},
) {
  const name = options.name ?? "Tiny";
  return defineDocumentModel({
    id: options.id ?? "test/tiny",
    name,
    description: "",
    extension: "tiny",
    version: 1,
    author: { name: "Powerhouse" },
    scopes: {
      global: {
        schema: ph.object(`${name}State`, {
          fields: { title: ph.String({ required: true }) },
        }),
        initialValue: { title: "" },
        ...(options.examples === undefined
          ? {}
          : { examples: options.examples }),
      },
      local: { schema: null, initialValue: {} },
    },
  });
}

describe("the structured definition builder", () => {
  it("emits named types in traversal order, once per token", () => {
    const specification = specificationOf(Invoice);
    expect(specification.types.map((type) => type.name)).toStrictEqual([
      "InvoiceState",
      "InvoiceStatus",
      "Contact",
      "InvoiceLineItem",
      "InvoiceLocalState",
      "ArchivedInvoice",
      "InvoicePatch",
    ]);
    const patch = specification.types.at(-1);
    if (patch?.kind !== "input") throw new Error("expected an input");
    expect(patch.fields.map((field) => field.type)).toStrictEqual([
      { kind: "scalar", name: "String", required: false },
      { kind: "named", name: "InvoiceStatus", required: false },
    ]);
  });

  it("emits a diamond and a cycle once each", () => {
    const specification = specificationOf(Invoice);
    const names = specification.types.map((type) => type.name);
    expect(names.filter((name) => name === "Contact")).toHaveLength(1);
    expect(names.filter((name) => name === "InvoiceLineItem")).toHaveLength(1);
    const lineItem = specification.types.find(
      (type) => type.name === "InvoiceLineItem",
    );
    if (lineItem?.kind !== "object") throw new Error("expected an object");
    expect(
      lineItem.fields.map((field) => [field.name, field.type]),
    ).toContainEqual([
      "parent",
      { kind: "named", name: "InvoiceLineItem", required: false },
    ]);
  });

  it("emits each token once through a union and through an interface cycle", () => {
    const Named = ph.interface("NamedNode", {
      fields: { name: ph.String({ required: true }) },
    });
    const Branch = ph.object("Branch", {
      fields: {
        name: ph.String({ required: true }),
        child: ph.ref((): AnyTypeDescriptor => Tree),
      },
      implements: [Named],
    });
    const Leaf = ph.object("Leaf", {
      fields: {
        name: ph.String({ required: true }),
        sibling: ph.ref((): AnyTypeDescriptor => Leaf),
      },
      implements: [Named],
    });
    const Tree = ph.union("Tree", { members: [Branch, Leaf] });
    const model = defineDocumentModel({
      id: "test/cycles",
      name: "Cycles",
      description: "",
      extension: "cyc",
      version: 1,
      author: { name: "Powerhouse" },
      scopes: {
        global: {
          schema: ph.object("CyclesState", {
            fields: { root: ph.ref(Tree), also: ph.ref(Branch) },
          }),
          initialValue: { root: null, also: null },
        },
        local: { schema: null, initialValue: {} },
      },
    });
    const specification = specificationOf(
      materialize(model.version({ modules: [] })) as unknown as typeof Invoice,
    );
    expect(specification.types.map((type) => type.name)).toStrictEqual([
      "CyclesState",
      "Tree",
      "Branch",
      "NamedNode",
      "Leaf",
    ]);
    const branch = specification.types.find((type) => type.name === "Branch");
    if (branch?.kind !== "object") throw new Error("expected an object");
    expect(branch.implements).toStrictEqual(["NamedNode"]);
  });

  it("emits the interfaces an interface implements, as SDL graphql can build", () => {
    const Named = ph.interface("Named", { fields: { name: ph.String() } });
    const Titled = ph.interface("Titled", {
      fields: { name: ph.String(), title: ph.String() },
      implements: [Named],
    });
    const Book = ph.object("Book", {
      fields: { name: ph.String(), title: ph.String() },
      implements: [Titled, Named],
    });
    const model = defineDocumentModel({
      id: "test/interface-implements",
      name: "Shelf",
      description: "",
      extension: "shelf",
      version: 1,
      author: { name: "Powerhouse" },
      scopes: {
        global: {
          schema: ph.object("ShelfState", { fields: { book: ph.ref(Book) } }),
          initialValue: { book: null },
        },
        local: { schema: null, initialValue: {} },
      },
    });
    const shelf = materialize(model.version({ modules: [] }));
    const specification = specificationOf(shelf as unknown as typeof Invoice);
    expect(
      specification.types.map((type) => [
        type.name,
        "implements" in type ? type.implements : undefined,
      ]),
    ).toStrictEqual([
      ["ShelfState", undefined],
      ["Book", ["Titled", "Named"]],
      ["Titled", ["Named"]],
      ["Named", undefined],
    ]);
    const sdl = shelf.documentModel.global.specifications.at(0)?.state.global
      .schema as string;
    expect(sdl).toContain("interface Titled implements Named {");
    expect(
      validateSchema(buildSchema(`${sdl}\n\ntype Query { state: ShelfState }`)),
    ).toStrictEqual([]);
  });

  it("puts an anonymous operation input on its operation, not in types", () => {
    const specification = specificationOf(Invoice);
    expect(
      specification.types.some((type) => type.name.endsWith("Input")),
    ).toBe(false);
    expect(specification.types.map((type) => type.name)).toContain(
      "InvoicePatch",
    );
    const operation = specification.modules[0]?.operations[0];
    expect(operation.input?.name).toBe("AddLineItemInput");
    expect(operation.input?.unknownKeys).toBe("preserve");
  });

  it("emits a reusable named input once, referenced from each operation", () => {
    const Paging = ph.input("PagingInput", {
      fields: { size: ph.Int({ required: true }) },
    });
    const model = tinyModel();
    const module = model.module("paging", {
      operations: ({ global }) => ({
        first: global({
          input: ph.input({ fields: { page: ph.ref(Paging) } }),
          reduce() {},
        }),
        second: global({
          input: ph.input({ fields: { page: ph.ref(Paging) } }),
          reduce() {},
        }),
      }),
    });
    const materialized = materialize(model.version({ modules: [module] }));
    const specification = materialized.definition.specifications[0];
    expect(
      specification.types.filter((type) => type.name === "PagingInput"),
    ).toHaveLength(1);
    expect(
      specification.modules[0].operations.map(
        (operation) => operation.input?.name,
      ),
    ).toStrictEqual(["FirstInput", "SecondInput"]);
    const stored =
      materialized.documentModel.global.specifications[0]?.modules[0]
        ?.operations ?? [];
    expect(stored[0].schema).toBe(
      "input FirstInput {\n  page: PagingInput\n}\n\ninput PagingInput {\n  size: Int!\n}\n",
    );
    expect(stored[1].schema).toBe(
      "input SecondInput {\n  page: PagingInput\n}\n",
    );
  });

  it("rejects a named input as an operation's own input", () => {
    const Paging = ph.input("PagingInput", {
      fields: { size: ph.Int({ required: true }) },
    });
    const model = tinyModel();
    const module = model.module("paging", {
      operations: ({ global }) => ({
        first: global({ input: Paging, reduce() {} }),
        second: global({ input: Paging, reduce() {} }),
      }),
    });
    const diagnostics = diagnosticsOf(() =>
      materialize(model.version({ modules: [module] })),
    );
    expect(diagnostics[0]).toMatchObject({
      code: "PH-DM-DECLARATION-INVALID",
      expected: "FirstInput",
      received: "PagingInput",
    });
    expect(diagnostics[0]?.repair).toContain("ph.input({ fields: { ... } })");
    const named = model.module("named", {
      operations: ({ global }) => ({
        first: global({
          input: ph.input("FirstInput", {
            fields: { size: ph.Int({ required: true }) },
          }),
          reduce() {},
        }),
      }),
    });
    expect(
      materialize(model.version({ modules: [named] })).definition
        .specifications[0]?.modules[0]?.operations[0]?.input?.name,
    ).toBe("FirstInput");
  });

  it("names one reused anonymous input per operation without mutating it", () => {
    const shared = ph.input({ fields: { note: ph.String() } });
    const model = tinyModel();
    const module = model.module("notes", {
      operations: ({ global }) => ({
        setNote: global({ input: shared, reduce() {} }),
        appendNote: global({ input: shared, reduce() {} }),
      }),
    });
    const specification = specificationOf(
      materialize(
        model.version({ modules: [module] }),
      ) as unknown as typeof Invoice,
    );
    expect(
      specification.modules[0]?.operations.map(
        (operation) => operation.input?.name,
      ),
    ).toStrictEqual(["SetNoteInput", "AppendNoteInput"]);
    expect(shared.name).toBeNull();
  });

  it("keeps an unreachable type out of types unless it is an auxiliary type", () => {
    const Orphan = ph.object("Orphan", { fields: { id: ph.OID() } });
    const withoutAuxiliary = tinyModel();
    const specification = specificationOf(
      materialize(
        withoutAuxiliary.version({ modules: [] }),
      ) as unknown as typeof Invoice,
    );
    expect(specification.types.map((type) => type.name)).toStrictEqual([
      "TinyState",
    ]);
    expect(Orphan.name).toBe("Orphan");
    expect(specificationOf(Invoice).types.map((type) => type.name)).toContain(
      "ArchivedInvoice",
    );
  });

  it("records scalar references in catalog order and nothing else", () => {
    const specification = specificationOf(Invoice);
    expect(specification.scalars).toStrictEqual([
      {
        name: "DateTime",
        implementation: "powerhouse.catalog#DateTime",
        coercionProfile: "catalog-v1",
      },
      {
        name: "EmailAddress",
        implementation: "powerhouse.catalog#EmailAddress",
        coercionProfile: "catalog-v1",
      },
      {
        name: "Amount_Money",
        implementation: "powerhouse.catalog#Amount_Money",
        coercionProfile: "catalog-v1",
      },
      {
        name: "Currency",
        implementation: "powerhouse.catalog#Currency",
        coercionProfile: "catalog-v1",
      },
      {
        name: "PHID",
        implementation: "powerhouse.catalog#PHID",
        coercionProfile: "catalog-v1",
      },
      {
        name: "OID",
        implementation: "powerhouse.catalog#OID",
        coercionProfile: "catalog-v1",
      },
    ]);
    const encoded = JSON.stringify(specification.scalars);
    for (const leak of [
      "zero",
      "representation",
      "description",
      "persistable",
    ]) {
      expect(encoded).not.toContain(leak);
    }
    expect(encoded).not.toContain("String");
  });

  it("records a scalar reached only through an auxiliary type", () => {
    const Aux = ph.object("AuxAmount", { fields: { money: ph.Money() } });
    const model = defineDocumentModel({
      id: "test/auxiliary-scalar",
      name: "AuxiliaryScalar",
      description: "",
      extension: "aux",
      version: 1,
      author: { name: "Powerhouse" },
      scopes: {
        auxiliaryTypes: [Aux],
        global: {
          schema: ph.object("AuxiliaryScalarState", {
            fields: { title: ph.String({ required: true }) },
          }),
          initialValue: { title: "" },
        },
        local: { schema: null, initialValue: {} },
      },
    });
    const specification = specificationOf(
      materialize(model.version({ modules: [] })) as unknown as typeof Invoice,
    );
    expect(specification.scalars.map((scalar) => scalar.name)).toStrictEqual([
      "Amount_Money",
    ]);
    expect(specification.state.global.materialized.schema).toContain(
      "type AuxAmount {",
    );
  });

  it("materializes both scopes, with an empty local scope as the empty string", () => {
    const specification = specificationOf(Invoice);
    expect(specification.state.global.root).toStrictEqual({
      kind: "named",
      name: "InvoiceState",
      required: true,
    });
    expect(specification.state.global.materialized.schema).toContain(
      "type InvoiceState {",
    );
    expect(specification.state.local.materialized.schema).toBe(
      "type InvoiceLocalState {\n  draftNote: String\n}\n",
    );
    const emptyLocal = specificationOf(
      materialize(
        tinyModel().version({ modules: [] }),
      ) as unknown as typeof Invoice,
    );
    expect(emptyLocal.state.local).toMatchObject({
      root: null,
      initialValue: {},
      unknownKeys: "preserve",
      materialized: { schema: "", initialValue: "{}" },
    });
  });

  it("keeps the digest stable in one process and in a fresh process", () => {
    const digest = canonicalDigest(Invoice.definition);
    expect(digest).toBe(canonicalDigest(Invoice.definition));
    const again = materialize(invoice.version({ modules: [] }));
    expect(again.definition.model).toStrictEqual(Invoice.definition.model);
    const directory = mkdtempSync(resolve(tmpdir(), "cf-structured-digest-"));
    const script = resolve(directory, "digest.ts");
    writeFileSync(
      script,
      [
        `import { canonicalDigest } from ${JSON.stringify(resolve(here, "../../../src/definition/kernel/primitives.js"))};`,
        `import { Invoice } from ${JSON.stringify(resolve(here, "../fixtures/invoice.js"))};`,
        "process.stdout.write(canonicalDigest(Invoice.definition));",
      ].join("\n"),
    );
    let fresh: string;
    try {
      fresh = execFileSync(
        "pnpm",
        ["exec", "tsx", "--conditions=source", script],
        {
          cwd: resolve(here, "../../.."),
          encoding: "utf8",
        },
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
    expect(fresh).toBe(digest);
  }, 60_000);

  it("ignores bookkeeping key insertion order", () => {
    const build = (order: "code-first" | "description-first") => {
      const model = tinyModel();
      const module = model.module("orders", {
        operations: ({ global }) => ({
          place: global({
            input: ph.input({ fields: { id: ph.OID({ required: true }) } }),
            errors:
              order === "code-first"
                ? { Rejected: { code: "REJECTED", description: "no" } }
                : { Rejected: { description: "no", code: "REJECTED" } },
            reduce() {},
          }),
        }),
      });
      return materialize(model.version({ modules: [module] })).definition;
    };
    expect(build("code-first")).toStrictEqual(build("description-first"));
  });

  it("changes the structured order and the digest when authored order changes", () => {
    const build = (reversed: boolean) => {
      const model = defineDocumentModel({
        id: "test/ordered",
        name: "Ordered",
        description: "",
        extension: "ord",
        version: 1,
        author: { name: "Powerhouse" },
        scopes: {
          global: {
            schema: ph.object("OrderedState", {
              fields: reversed
                ? {
                    second: ph.String({ required: true }),
                    first: ph.String({ required: true }),
                  }
                : {
                    first: ph.String({ required: true }),
                    second: ph.String({ required: true }),
                  },
            }),
            initialValue: { first: "", second: "" },
          },
          local: { schema: null, initialValue: {} },
        },
      });
      return materialize(model.version({ modules: [] }));
    };
    const forward = build(false);
    const backward = build(true);
    const forwardRoot = forward.definition.specifications[0]?.types[0];
    const backwardRoot = backward.definition.specifications[0]?.types[0];
    if (forwardRoot.kind !== "object" || backwardRoot.kind !== "object") {
      throw new Error("expected object roots");
    }
    expect(forwardRoot.fields.map((field) => field.name)).toStrictEqual([
      "first",
      "second",
    ]);
    expect(backwardRoot.fields.map((field) => field.name)).toStrictEqual([
      "second",
      "first",
    ]);
    expect(forward.definition).not.toStrictEqual(backward.definition);
  });

  it("rejects two operations in different modules deriving one action type", () => {
    const model = tinyModel();
    const first = model.module("first", {
      operations: ({ global }) => ({
        setTitle: global({
          input: ph.input({ fields: { title: ph.String({ required: true }) } }),
          reduce() {},
        }),
      }),
    });
    const second = model.module("second", {
      operations: ({ global }) => ({
        setTitle: global({
          input: ph.input({ fields: { title: ph.String({ required: true }) } }),
          reduce() {},
        }),
      }),
    });
    const diagnostics = diagnosticsOf(() =>
      materialize(model.version({ modules: [first, second] })),
    );
    const duplicate = diagnostics.find(
      (diagnostic) => diagnostic.code === "PH-DM-DUPLICATE-ACTION",
    );
    expect(duplicate?.path).toStrictEqual([
      "modules",
      "second",
      "operations",
      "setTitle",
    ]);
    expect(duplicate?.related?.[0]?.path).toStrictEqual([
      "modules",
      "first",
      "operations",
      "setTitle",
    ]);
    expect(duplicate?.message).toContain("SET_TITLE");
  });

  it("rejects an input type in an output position", () => {
    const Reused = ph.input("ReusedInput", { fields: { id: ph.OID() } });
    const diagnostics = diagnosticsOf(() =>
      defineDocumentModel({
        id: "test/positions",
        name: "Positions",
        description: "",
        extension: "pos",
        version: 1,
        author: { name: "Powerhouse" },
        scopes: {
          global: {
            schema: ph.object("PositionsState", {
              fields: { reused: ph.ref(Reused) },
            }),
            initialValue: { reused: null },
          },
          local: { schema: null, initialValue: {} },
        },
      }).version({ modules: [] }),
    );
    expect(diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      "PH-DM-TYPE-POSITION-INVALID",
    );
    expect(diagnostics[0]?.repair).toContain("stored state");
  });

  it("rejects an output type in an input position", () => {
    const model = tinyModel();
    const Payload = ph.object("Payload", { fields: { id: ph.OID() } });
    const module = model.module("payloads", {
      operations: ({ global }) => ({
        send: global({
          input: ph.input({ fields: { payload: ph.ref(Payload) } }),
          reduce() {},
        }),
      }),
    });
    expect(
      codesOf(() => materialize(model.version({ modules: [module] }))),
    ).toContain("PH-DM-TYPE-POSITION-INVALID");
  });

  it("reports an unresolved lazy reference at the authored path", () => {
    const model = defineDocumentModel({
      id: "test/lazy",
      name: "Lazy",
      description: "",
      extension: "lazy",
      version: 1,
      author: { name: "Powerhouse" },
      scopes: {
        global: {
          schema: ph.object("LazyState", {
            fields: {
              broken: ph.ref(() => undefined as never),
            },
          }),
          initialValue: { broken: null },
        },
        local: { schema: null, initialValue: {} },
      },
    });
    const diagnostics = diagnosticsOf(() =>
      materialize(model.version({ modules: [] })),
    );
    const diagnostic = diagnostics.find(
      (candidate) => candidate.code === "PH-DEF-REFERENCE-TARGET-INVALID",
    );
    expect(diagnostic?.path).toStrictEqual([
      "scopes",
      "global",
      "schema",
      "fields",
      "broken",
    ]);
  });

  it("rejects a module from another context with the same state shape", () => {
    const one = tinyModel({ id: "test/one", name: "Tiny" });
    const two = tinyModel({ id: "test/two", name: "Tiny" });
    const foreign = two.module("foreign", {
      operations: ({ global }) => ({
        setTitle: global({
          input: ph.input({ fields: { title: ph.String({ required: true }) } }),
          reduce() {},
        }),
      }),
    });
    const diagnostics = diagnosticsOf(() =>
      materialize(one.version({ modules: [foreign] })),
    );
    expect(
      diagnostics.map(({ code, path, message }) => ({ code, path, message })),
    ).toStrictEqual([
      {
        code: "PH-DM-DECLARATION-INVALID",
        path: ["modules", 0],
        message:
          "This module was created by a different document-model context.",
      },
    ]);
  });

  it("rejects two modules with one key", () => {
    const model = tinyModel();
    const first = model.module("shared", { operations: () => ({}) });
    const second = model.module("shared", { operations: () => ({}) });
    const diagnostics = diagnosticsOf(() =>
      materialize(model.version({ modules: [first, second] })),
    );
    expect(diagnostics[0]?.code).toBe("PH-DM-DUPLICATE-NAME");
    expect(diagnostics[0]?.related?.[0]?.path).toStrictEqual([
      "modules",
      0,
      "key",
    ]);
  });

  it("rejects duplicate example keys in one scope", () => {
    const diagnostics = diagnosticsOf(() =>
      tinyModel({
        examples: [
          { key: "same", value: "{}" },
          { key: "same", value: "{}" },
        ],
      }).version({ modules: [] }),
    );
    expect(diagnostics[0]?.code).toBe("PH-DM-IDENTITY-INVALID");
    expect(diagnostics[0]?.path).toStrictEqual([
      "scopes",
      "global",
      "examples",
      1,
      "key",
    ]);
  });

  it("rejects an authored default in document state and keeps one in an action input", () => {
    const stateDiagnostics = diagnosticsOf(() =>
      defineDocumentModel({
        id: "test/defaults",
        name: "Defaults",
        description: "",
        extension: "def",
        version: 1,
        author: { name: "Powerhouse" },
        scopes: {
          global: {
            schema: ph.object("DefaultsState", {
              fields: { title: ph.String({ defaultValue: "untitled" }) },
            }),
            initialValue: { title: null },
          },
          local: { schema: null, initialValue: {} },
        },
      }).version({ modules: [] }),
    );
    expect(stateDiagnostics[0]?.code).toBe("PH-DM-DEFAULT-UNSUPPORTED");
    expect(stateDiagnostics[0]?.repair).toBe(
      "Remove defaultValue and set the value in the scope initial value or in the reducer. To default an operation input, declare defaultValue on the field of its ph.input.",
    );

    const model = tinyModel();
    const module = model.module("defaults", {
      operations: ({ global }) => ({
        setTitle: global({
          input: ph.input({
            fields: { title: ph.String({ defaultValue: "untitled" }) },
          }),
          reduce() {},
        }),
      }),
    });
    const compiled = materialize(
      model.version({
        modules: [module],
      }),
    ) as unknown as typeof Invoice;
    const operation = specificationOf(compiled).modules[0]?.operations[0];
    expect(operation.input?.fields).toStrictEqual([
      {
        key: "title",
        name: "title",
        description: null,
        deprecated: null,
        type: { kind: "scalar", name: "String", required: false },
        defaultValue: "untitled",
      },
    ]);
    expect(
      compiled.documentModel.global.specifications.at(0)?.modules[0]
        ?.operations[0]?.schema,
    ).toContain('title: String = "untitled"');
  });

  it("records equals as an @equals use in the definition and its SDL", () => {
    const model = tinyModel();
    const module = model.module("codes", {
      operations: ({ global }) => ({
        setCode: global({
          input: ph.input({ fields: { code: ph.String({ equals: "abc" }) } }),
          reduce() {},
        }),
      }),
    });
    const compiled = materialize(
      model.version({
        modules: [module],
      }),
    ) as unknown as typeof Invoice;
    const operation = specificationOf(compiled).modules[0]?.operations[0];
    expect(operation.input?.fields[0]?.directives).toStrictEqual([
      { name: "equals", arguments: [{ name: "value", value: "abc" }] },
    ]);
    expect(
      compiled.documentModel.global.specifications.at(0)?.modules[0]
        ?.operations[0]?.schema,
    ).toContain('code: String @equals(value: "abc")');
  });

  it("prints an enum default as an enum value in every segment", () => {
    const Tone = ph.enum("Tone", { values: ["LOW", "HIGH"] });
    const Filter = ph.input("ToneFilter", {
      fields: { tone: ph.ref(Tone, { required: true, defaultValue: "HIGH" }) },
    });
    const model = defineDocumentModel({
      id: "test/enum-defaults",
      name: "Tones",
      description: "",
      extension: "tones",
      version: 1,
      author: { name: "Powerhouse" },
      scopes: {
        auxiliaryTypes: [Filter],
        global: {
          schema: ph.object("TonesState", { fields: { tone: ph.ref(Tone) } }),
          initialValue: { tone: null },
        },
        local: { schema: null, initialValue: {} },
      },
    });
    const module = model.module("tones", {
      operations: ({ global }) => ({
        setTone: global({
          input: ph.input({
            fields: {
              tone: ph.ref(Tone, { required: true, defaultValue: "LOW" }),
            },
          }),
          reduce() {},
        }),
      }),
    });
    const compiled = materialize(
      model.version({
        modules: [module],
      }),
    ) as unknown as typeof Invoice;
    const stored = compiled.documentModel.global.specifications.at(0);
    const schema = buildSchema(
      [
        stored?.state.global.schema,
        ...(stored?.modules.flatMap((entry) =>
          entry.operations.map((operation) => operation.schema),
        ) ?? []),
        "type Query { state: TonesState }",
      ].join("\n\n"),
    );
    expect(validateSchema(schema)).toStrictEqual([]);
    const defaultOf = (type: string) =>
      (
        schema.getType(type) as {
          getFields(): Record<string, { defaultValue?: unknown }>;
        }
      ).getFields().tone.defaultValue;
    expect([defaultOf("ToneFilter"), defaultOf("SetToneInput")]).toStrictEqual([
      "HIGH",
      "LOW",
    ]);
  });

  it("rejects two descriptors claiming one GraphQL type name", () => {
    const first = ph.object("Shared", { fields: { a: ph.String() } });
    const second = ph.object("Shared", { fields: { b: ph.String() } });
    const diagnostics = diagnosticsOf(() =>
      defineDocumentModel({
        id: "test/collide",
        name: "Collide",
        description: "",
        extension: "col",
        version: 1,
        author: { name: "Powerhouse" },
        scopes: {
          auxiliaryTypes: [second],
          global: {
            schema: ph.object("CollideState", {
              fields: { shared: ph.ref(first) },
            }),
            initialValue: { shared: null },
          },
          local: { schema: null, initialValue: {} },
        },
      }).version({ modules: [] }),
    );
    expect(diagnostics[0]?.code).toBe("PH-DM-DUPLICATE-NAME");
    expect(diagnostics[0]?.received).toBe("Shared");
  });

  it("accepts a shared descriptor and a repeated error key in two operations", () => {
    const specification = specificationOf(Invoice);
    const operations = specification.modules[0]?.operations ?? [];
    expect(
      operations.map((operation) => operation.errors[0]?.key),
    ).toStrictEqual(["InvoiceAlreadyIssued", "InvoiceAlreadyIssued"]);
    expect(operations[0]?.errors[0]?.id).not.toBe(operations[1]?.errors[0]?.id);
  });

  it("rejects an operation key whose derived creator key differs", () => {
    const model = tinyModel();
    const module = model.module("acronyms", {
      operations: ({ global }) => ({
        setURL: global({
          input: ph.input({ fields: { url: ph.URL({ required: true }) } }),
          reduce() {},
        }),
      }),
    });
    const diagnostics = diagnosticsOf(() =>
      materialize(model.version({ modules: [module] })),
    );
    expect(diagnostics[0]?.code).toBe("PH-DM-DECLARATION-INVALID");
    expect(diagnostics[0]?.expected).toBe("setUrl");
    expect(diagnostics[0]?.repair).toContain('"setUrl"');
  });
});

describe("the stored SDL segments", () => {
  const Shared = ph.object("SharedThing", {
    fields: { id: ph.OID({ required: true }) },
  });
  const InputOnlyStatus = ph.enum("InputOnlyStatus", {
    values: ["QUEUED", "SENT"],
  });
  const Nested = ph.input("NestedPatch", {
    fields: { note: ph.String(), status: ph.ref(InputOnlyStatus) },
  });
  const Orphan = ph.input("OrphanInput", { fields: { id: ph.OID() } });
  const model = defineDocumentModel({
    id: "test/segments",
    name: "Segments",
    description: "",
    extension: "seg",
    version: 1,
    author: { name: "Powerhouse" },
    scopes: {
      auxiliaryTypes: [Orphan],
      global: {
        schema: ph.object("SegmentsState", {
          fields: {
            shared: ph.ref(Shared),
            title: ph.String({ required: true }),
          },
        }),
        initialValue: { shared: null, title: "" },
      },
      local: {
        schema: ph.object("SegmentsLocalState", {
          fields: { shared: ph.ref(Shared), note: ph.String() },
        }),
        initialValue: { shared: null, note: null },
      },
    },
  });
  const module = model.module("patches", {
    operations: ({ global }) => ({
      patch: global({
        input: ph.input({ fields: { patch: ph.ref(Nested) } }),
        reduce() {},
      }),
      repatch: global({
        input: ph.input({ fields: { patch: ph.ref(Nested) } }),
        reduce() {},
      }),
      clear: global({ input: ph.input({ fields: {} }), reduce() {} }),
    }),
  });
  const Segments = materialize(model.version({ modules: [module] }));
  const specification = Segments.definition.specifications.at(0);
  if (specification === undefined) throw new Error("no specification");
  const stored = Segments.documentModel.global.specifications.at(0);
  if (stored === undefined) throw new Error("no stored specification");

  const segments = [
    stored.state.global.schema,
    stored.state.local.schema,
    ...stored.modules.flatMap((module) =>
      module.operations.map((operation) => operation.schema ?? ""),
    ),
  ].filter((segment) => segment.length > 0);

  it("declares every named type exactly once", () => {
    const declared = segments
      .join("\n")
      .matchAll(/^(?:type|input|enum|union|interface)\s+(\w+)/gm);
    const names = [...declared].map((match) => match[1]);
    expect([...names].sort()).toStrictEqual([...new Set(names)].sort());
    for (const type of specification.types) {
      expect(names, type.name).toContain(type.name);
    }
  });

  it("assembles into one schema that graphql can build", () => {
    const schema = buildSchema(
      ["scalar OID", ...segments, "type Query { state: SegmentsState }"].join(
        "\n\n",
      ),
    );
    expect(validateSchema(schema)).toStrictEqual([]);
    for (const type of specification.types) {
      expect(schema.getType(type.name), type.name).toBeDefined();
    }
  });

  it("keeps an operation's input types out of the state segments", () => {
    for (const operationInput of [
      "input PatchInput {",
      "input RepatchInput {",
      "input ClearInput {",
      "input NestedPatch {",
    ]) {
      expect(stored.state.global.schema).not.toContain(operationInput);
    }
    expect(stored.state.local.schema).not.toContain("input ");
    const patch = stored.modules[0].operations[0].schema ?? "";
    expect(patch).toContain("input PatchInput {");
    expect(patch).toContain("input NestedPatch {");
    expect(stored.modules[0].operations[2].schema).toBe(
      "input ClearInput {\n  _empty: Boolean\n}\n",
    );
    expect(stored.modules[0].operations[1].schema).toBe(
      "input RepatchInput {\n  patch: NestedPatch\n}\n",
    );
    expect(stored.state.global.schema).toContain("input OrphanInput {");
  });

  it("declares an input-only enum in the global segment", () => {
    expect(stored.state.global.schema).toContain("enum InputOnlyStatus {");
    expect(stored.modules[0].operations[0].schema).not.toContain(
      "enum InputOnlyStatus {",
    );
  });

  it("declares a type both roots reach in the global segment only", () => {
    expect(stored.state.global.schema).toContain("type SharedThing {");
    expect(stored.state.local.schema).not.toContain("type SharedThing {");
    expect(stored.state.local.schema).toContain("type SegmentsLocalState {");
  });

  it("rejects a member-less object or interface type", () => {
    const build = (schema: unknown) =>
      defineDocumentModel({
        id: "test/memberless",
        name: "Memberless",
        description: "",
        extension: "ml",
        version: 1,
        author: { name: "Powerhouse" },
        scopes: {
          global: {
            schema: ph.object("MemberlessState", {
              fields: { thing: ph.ref(schema as never) },
            }),
            initialValue: { thing: null },
          },
          local: { schema: null, initialValue: {} },
        },
      }).version({ modules: [] });
    const object = diagnosticsOf(() =>
      build(ph.object("EmptyObject", { fields: {} })),
    );
    expect(object[0]).toMatchObject({ code: "PH-DM-DECLARATION-INVALID" });
    expect(object[0]?.message).toContain("EmptyObject");
    expect(object[0]?.repair).toContain("ph.input({ fields: {} })");
    const iface = diagnosticsOf(() =>
      build(ph.interface("EmptyInterface", { fields: {} })),
    );
    expect(iface[0]?.message).toContain("EmptyInterface");
  });
});

describe("operation input defaults", () => {
  const Status = ph.enum("DefaultStatus", { values: ["OPEN", "DONE"] });
  const Item = ph.input("DefaultItemInput", {
    fields: {
      name: ph.String({ required: true }),
      count: ph.Int({ required: true, defaultValue: 1 }),
    },
  });

  function compileInput(value: AnyFieldDescriptor) {
    const model = tinyModel();
    const module = model.module("defaults", {
      operations: ({ global }) => ({
        setValue: global({
          input: ph.input("SetValueInput", { fields: { value } }),
          reduce() {},
        }),
      }),
    });
    return materialize(model.version({ modules: [module] }));
  }

  it.each([
    [
      "Int",
      ph.Int({ defaultValue: "x" }),
      "Int",
      '"x"',
      '"x" is not a signed 32-bit integer',
    ],
    [
      "a fractional Int",
      ph.Int({ defaultValue: 1.5 }),
      "Int",
      "1.5",
      "1.5 is not a signed 32-bit integer",
    ],
    [
      "an Int above 32 bits",
      ph.Int({ defaultValue: 2 ** 31 }),
      "Int",
      "2147483648",
      "2147483648 is not a signed 32-bit integer",
    ],
    [
      "null on a required field",
      ph.String({ required: true, defaultValue: null }),
      "String!",
      "null",
      "null is not accepted by a required field",
    ],
    [
      "an enum non-member",
      ph.ref(Status, { defaultValue: "MAYBE" }),
      "DefaultStatus",
      '"MAYBE"',
      '"MAYBE" is not a value of enum DefaultStatus (OPEN, DONE)',
    ],
    [
      "an enum default given as a number",
      ph.ref(Status, { defaultValue: 1 }),
      "DefaultStatus",
      "1",
      "1 is not a value of enum DefaultStatus (OPEN, DONE)",
    ],
    [
      "an input object with an unknown key",
      ph.ref(Item, { defaultValue: { name: "a", extra: 1 } }),
      "DefaultItemInput",
      '{"extra":1,"name":"a"}',
      'field "extra" is not declared on DefaultItemInput',
    ],
    [
      "an input object missing a required field",
      ph.ref(Item, { defaultValue: {} }),
      "DefaultItemInput",
      "{}",
      'required field "name" of DefaultItemInput is missing',
    ],
    [
      "an input object with a wrong nested type",
      ph.ref(Item, { defaultValue: { name: 5 } }),
      "DefaultItemInput",
      '{"name":5}',
      'field "name": 5 is not a string',
    ],
    [
      "a list with a wrong item",
      ph.list(ph.Int(), { defaultValue: [1, "two"] }),
      "[Int]",
      '[1,"two"]',
      'item 1: "two" is not a signed 32-bit integer',
    ],
    [
      "a value equals rejects",
      ph.String({ equals: "abc", defaultValue: "abd" }),
      "String",
      '"abd"',
      '"abd" is not a valid String: Invalid string: must match pattern /^abc$/',
    ],
    [
      "a DateTime that is not a date",
      ph.DateTime({ defaultValue: "not-a-date" }),
      "DateTime",
      '"not-a-date"',
      '"not-a-date" is not a valid DateTime: Invalid ISO datetime',
    ],
  ])("refuses %s", (_, field, type, received, reason) => {
    const diagnostics = diagnosticsOf(() =>
      compileInput(field as AnyFieldDescriptor),
    );
    expect(
      diagnostics.map(
        ({ code, path, message, expected, received, repair }) => ({
          code,
          path,
          message,
          expected,
          received,
          repair,
        }),
      ),
    ).toStrictEqual([
      {
        code: "PH-DEF-OPTION-INVALID",
        path: [
          "modules",
          0,
          "operations",
          0,
          "input",
          "fields",
          "value",
          "defaultValue",
        ],
        message: `defaultValue is not a valid value of type ${type}: ${reason}.`,
        expected: `a value of type ${type}`,
        received,
        repair:
          "Use a default the field's type accepts, or remove defaultValue.",
      },
    ]);
  });

  it("gives the validator's reason once, ending in one period", () => {
    expect(
      diagnosticsOf(() =>
        compileInput(ph.EmailAddress({ defaultValue: "nope" })),
      ).map((diagnostic) => diagnostic.message),
    ).toStrictEqual([
      'defaultValue is not a valid value of type EmailAddress: "nope" is not a valid EmailAddress: Invalid email address.',
    ]);
  });

  it.each([
    [
      "a required String",
      ph.String({ required: true, defaultValue: "Untitled" }),
      'value: String! = "Untitled"',
    ],
    [
      "null on a nullable Int",
      ph.Int({ defaultValue: null }),
      "value: Int = null",
    ],
    [
      "one value for a list",
      ph.list(ph.String(), { defaultValue: "a" }),
      'value: [String] = "a"',
    ],
    [
      "an input object that omits a defaulted field",
      ph.ref(Item, { defaultValue: { name: "a" } }),
      'value: DefaultItemInput = {name: "a"}',
    ],
    ["an integer ID", ph.ID({ defaultValue: 5 }), "value: ID = 5"],
    ["an integer Float", ph.Float({ defaultValue: 1 }), "value: Float = 1"],
    [
      "a DateTime",
      ph.DateTime({ defaultValue: "2026-01-01T00:00:00.000Z" }),
      'value: DateTime = "2026-01-01T00:00:00.000Z"',
    ],
    [
      "an enum member",
      ph.ref(Status, { defaultValue: "DONE" }),
      "value: DefaultStatus = DONE",
    ],
    [
      "an Amount with a float value",
      ph.Amount({ defaultValue: { value: 5.5 } }),
      "value: Amount = {value: 5.5}",
    ],
    [
      "an Amount with an integer value",
      ph.Amount({ defaultValue: { value: 5 } }),
      "value: Amount = {value: 5}",
    ],
    [
      "an integer Money",
      ph.Money({ defaultValue: 0 }),
      "value: Amount_Money = 0",
    ],
  ])("accepts %s", (_, field, line) => {
    const compiled = compileInput(field as AnyFieldDescriptor);
    expect(
      compiled.documentModel.global.specifications[0]?.modules[0]?.operations[0]
        ?.schema,
    ).toContain(line);
  });

  it("leaves a direct action creator's input as passed", () => {
    const compiled = compileInput(
      ph.String({ required: true, defaultValue: "Untitled" }),
    ) as unknown as {
      actions: { setValue(input: object): { input: unknown } };
    };
    expect(compiled.actions.setValue({}).input).toStrictEqual({});
    expect(compiled.actions.setValue({ value: "T" }).input).toStrictEqual({
      value: "T",
    });
  });
});

describe("project scalars in the stored SDL", () => {
  const Iban = defineScalar({ name: "Iban", schema: z.string() });
  const Bic = defineScalar({ name: "Bic", schema: z.string() });
  const Reference = defineScalar({ name: "Reference", schema: z.string() });
  const model = defineDocumentModel({
    id: "test/payroll",
    name: "Payroll",
    description: "",
    extension: "payroll",
    version: 1,
    author: { name: "Powerhouse" },
    scopes: {
      global: {
        schema: ph.object("PayrollState", {
          fields: {
            iban: ph.scalar(Iban, { required: true }),
            total: ph.Money(),
          },
        }),
        initialValue: { iban: "DE89370400440532013000", total: null },
      },
      local: {
        schema: ph.object("PayrollLocalState", {
          fields: { bic: ph.scalar(Bic) },
        }),
        initialValue: { bic: null },
      },
    },
  });
  const module = model.module("payments", {
    operations: ({ global }) => ({
      pay: global({
        input: ph.input({
          fields: {
            iban: ph.scalar(Iban, { required: true }),
            reference: ph.scalar(Reference),
          },
        }),
        reduce() {},
      }),
    }),
  });
  const stored = materialize(model.version({ modules: [module] })).documentModel
    .global.specifications[0];

  it("declares every project scalar atop the global segment, catalog scalars not at all", () => {
    expect(stored.state.global.schema).toBe(
      "scalar Bic\n\nscalar Iban\n\nscalar Reference\n\ntype PayrollState {\n  iban: Iban!\n  total: Amount_Money\n}\n",
    );
    expect(stored.state.local.schema).toBe(
      "type PayrollLocalState {\n  bic: Bic\n}\n",
    );
    expect(stored.modules[0].operations[0].schema).toBe(
      "input PayInput {\n  iban: Iban!\n  reference: Reference\n}\n",
    );
  });

  it("assembles with the catalog scalars into one schema that graphql can build", () => {
    const schema = buildSchema(
      [
        ...scalarCatalog.map(({ name }) => `scalar ${name}`),
        stored.state.global.schema,
        stored.state.local.schema,
        stored.modules[0].operations[0].schema ?? "",
        "type Query { global: PayrollState local: PayrollLocalState }",
      ].join("\n\n"),
    );
    expect(validateSchema(schema)).toStrictEqual([]);
  });

  it("refuses two scalar definitions that share a name, even with equal metadata", () => {
    const OnlyA = defineScalar({
      name: "SharedScalar",
      schema: z.string().regex(/^A$/),
    });
    const OnlyB = defineScalar({
      name: "SharedScalar",
      schema: z.string().regex(/^B$/),
    });
    const shared = tinyModel({ id: "test/shared", name: "Shared" });
    const module = shared.module("main", {
      operations: ({ global }) => ({
        a: global({
          input: ph.input({
            fields: { value: ph.scalar(OnlyA, { required: true }) },
          }),
          reduce() {},
        }),
        b: global({
          input: ph.input({
            fields: { value: ph.scalar(OnlyB, { required: true }) },
          }),
          reduce() {},
        }),
      }),
    });
    expect(
      diagnosticsOf(() => shared.version({ modules: [module] })).map(
        ({ code, path, received }) => ({ code, path, received }),
      ),
    ).toStrictEqual([
      {
        code: "PH-SCALAR-DUPLICATE-NAME",
        path: ["modules", 0, "operations", 1, "input", "fields", "value"],
        received: "SharedScalar",
      },
    ]);
  });

  it("declares nothing for a model without project scalars", () => {
    expect(
      materialize(tinyModel().version({ modules: [] })).documentModel.global
        .specifications[0].state.global.schema,
    ).toBe("type TinyState {\n  title: String!\n}\n");
  });
});
