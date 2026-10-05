import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  DefinitionDiagnostic,
  DocumentModelSpecificationDefinition,
} from "@powerhousedao/shared/document-model";
import { buildSchema, validateSchema } from "graphql";
import { describe, expect, it } from "vitest";
import { DocumentModelDefinitionError } from "../../src/definition/diagnostics.js";
import { ph } from "../../src/definition/field.js";
import { defineDocumentModel } from "../../src/definition/model.js";
import { canonicalDigest } from "../../src/definition/primitives.js";
import type { AnyTypeDescriptor } from "../../src/definition/types.js";
import { Invoice, invoice } from "./fixtures/invoice.js";

const here = dirname(fileURLToPath(import.meta.url));

function specificationOf(
  module: typeof Invoice,
): DocumentModelSpecificationDefinition {
  const specification = module.definition.specifications.at(0);
  if (specification === undefined) throw new Error("no specification");
  return specification;
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

function codesOf(run: () => unknown): readonly string[] {
  return diagnosticsOf(run).map((diagnostic) => diagnostic.code);
}

/** A minimal model whose scopes and modules the caller overrides. */
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
    specifications: {
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
      // 1. the global state root, then its first-encounter children
      "InvoiceState",
      "InvoiceStatus",
      "Contact",
      "InvoiceLineItem",
      // 2. the local state root
      "InvoiceLocalState",
      // 3. the authored auxiliary inventory
      "ArchivedInvoice",
      // 4. the modules and operations, in the finalized tuple order: this
      //    reusable input is first reached from the `patch` operation and
      //    references the enum stage 1 already emitted.
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
        // A cycle back through the union that holds this object.
        child: ph.ref((): AnyTypeDescriptor => Tree),
      },
      implements: [Named],
    });
    const Leaf = ph.object("Leaf", {
      fields: {
        name: ph.String({ required: true }),
        // The same interface, reached a second time.
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
      specifications: {
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
      model.finalize({ modules: [] }) as unknown as typeof Invoice,
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

  it("puts an anonymous operation input on its operation, not in types", () => {
    const specification = specificationOf(Invoice);
    // Every derived operation input name ends in `Input`; the one named input
    // in this model is `InvoicePatch`, which is in `types` deliberately.
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
    // Reuse is expressed by referencing the shared input from a field: both
    // consumers derive an operation's own input type name from the operation
    // name, so a shared type cannot be the top-level input.
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
    const finalized = model.finalize({ modules: [module] });
    const specification = finalized.definition.specifications[0];
    expect(
      specification.types.filter((type) => type.name === "PagingInput"),
    ).toHaveLength(1);
    expect(
      specification.modules[0].operations.map(
        (operation) => operation.input?.name,
      ),
    ).toStrictEqual(["FirstInput", "SecondInput"]);
    // The shared definition is stored once, with the first operation that
    // reaches it, and the second operation references it.
    const stored =
      finalized.documentModel.global.specifications[0]?.modules[0]
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
      model.finalize({ modules: [module] }),
    );
    expect(diagnostics[0]).toMatchObject({
      code: "PH-DM-DECLARATION-INVALID",
      expected: "FirstInput",
      received: "PagingInput",
    });
    expect(diagnostics[0]?.repair).toContain("ph.input({ fields: { ... } })");
    // An input named exactly as the operation derives it is accepted.
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
      model.finalize({ modules: [named] }).definition.specifications[0]
        ?.modules[0]?.operations[0]?.input?.name,
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
      model.finalize({ modules: [module] }) as unknown as typeof Invoice,
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
      withoutAuxiliary.finalize({ modules: [] }) as unknown as typeof Invoice,
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
        name: "PHID",
        implementation: "powerhouse.catalog#PHID",
        coercionProfile: "document-engineering-1.40",
      },
      {
        name: "OID",
        implementation: "powerhouse.catalog#OID",
        coercionProfile: "document-engineering-1.40",
      },
      {
        name: "Currency",
        implementation: "powerhouse.catalog#Currency",
        coercionProfile: "document-engineering-1.40",
      },
      {
        name: "EmailAddress",
        implementation: "powerhouse.catalog#EmailAddress",
        coercionProfile: "document-engineering-1.40",
      },
      {
        name: "DateTime",
        implementation: "powerhouse.catalog#DateTime",
        coercionProfile: "document-engineering-1.40",
      },
      {
        name: "Amount_Money",
        implementation: "powerhouse.catalog#Amount_Money",
        coercionProfile: "document-engineering-1.40",
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
    // GraphQL built-ins are not catalog members.
    expect(encoded).not.toContain("String");
  });

  it("records a scalar reached only through an auxiliary type", () => {
    // `types` carries the auxiliary inventory, so the projection declares its
    // scalars too; the state graph never reaches Amount_Money here.
    const Aux = ph.object("AuxAmount", { fields: { money: ph.Money() } });
    const model = defineDocumentModel({
      id: "test/auxiliary-scalar",
      name: "AuxiliaryScalar",
      description: "",
      extension: "aux",
      version: 1,
      author: { name: "Powerhouse" },
      specifications: {
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
      model.finalize({ modules: [] }) as unknown as typeof Invoice,
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
      tinyModel().finalize({ modules: [] }) as unknown as typeof Invoice,
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
    // A second declaration of the same version compiles to the same bytes.
    const again = invoice.finalize({ modules: [] });
    expect(again.definition.model).toStrictEqual(Invoice.definition.model);
    const script = resolve(tmpdir(), "cf-structured-digest.ts");
    writeFileSync(
      script,
      [
        `import { canonicalDigest } from ${JSON.stringify(resolve(here, "../../src/definition/primitives.js"))};`,
        `import { Invoice } from ${JSON.stringify(resolve(here, "fixtures/invoice.js"))};`,
        "process.stdout.write(canonicalDigest(Invoice.definition));",
      ].join("\n"),
    );
    const fresh = execFileSync(
      "pnpm",
      ["exec", "tsx", "--conditions=source", script],
      {
        cwd: resolve(here, "../.."),
        encoding: "utf8",
      },
    );
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
      return model.finalize({ modules: [module] }).definition;
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
        specifications: {
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
      return model.finalize({ modules: [] });
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
      model.finalize({ modules: [first, second] }),
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
        specifications: {
          global: {
            schema: ph.object("PositionsState", {
              fields: { reused: ph.ref(Reused) },
            }),
            initialValue: { reused: null },
          },
          local: { schema: null, initialValue: {} },
        },
      }).finalize({ modules: [] }),
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
    expect(codesOf(() => model.finalize({ modules: [module] }))).toContain(
      "PH-DM-TYPE-POSITION-INVALID",
    );
  });

  it("reports an unresolved lazy reference at the authored path", () => {
    const model = defineDocumentModel({
      id: "test/lazy",
      name: "Lazy",
      description: "",
      extension: "lazy",
      version: 1,
      author: { name: "Powerhouse" },
      specifications: {
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
    const diagnostics = diagnosticsOf(() => model.finalize({ modules: [] }));
    const diagnostic = diagnostics.find(
      (candidate) => candidate.code === "PH-DEF-REFERENCE-TARGET-INVALID",
    );
    expect(diagnostic?.path).toStrictEqual([
      "specifications",
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
      one.finalize({ modules: [foreign] }),
    );
    expect(diagnostics[0]?.code).toBe("PH-DM-DECLARATION-INVALID");
    expect(diagnostics[0]?.message).toContain("different document-model");
  });

  it("rejects two modules with one key", () => {
    const model = tinyModel();
    const first = model.module("shared", { operations: () => ({}) });
    const second = model.module("shared", { operations: () => ({}) });
    const diagnostics = diagnosticsOf(() =>
      model.finalize({ modules: [first, second] }),
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
      }).finalize({ modules: [] }),
    );
    expect(diagnostics[0]?.code).toBe("PH-DM-IDENTITY-INVALID");
    expect(diagnostics[0]?.path).toStrictEqual([
      "specifications",
      "global",
      "examples",
      1,
      "key",
    ]);
  });

  it("rejects an authored default in document state and in an action input", () => {
    const stateDiagnostics = diagnosticsOf(() =>
      defineDocumentModel({
        id: "test/defaults",
        name: "Defaults",
        description: "",
        extension: "def",
        version: 1,
        author: { name: "Powerhouse" },
        specifications: {
          global: {
            schema: ph.object("DefaultsState", {
              fields: { title: ph.String({ defaultValue: "untitled" }) },
            }),
            initialValue: { title: null },
          },
          local: { schema: null, initialValue: {} },
        },
      }).finalize({ modules: [] }),
    );
    expect(stateDiagnostics[0]?.code).toBe("PH-DM-DEFAULT-UNSUPPORTED");

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
    expect(codesOf(() => model.finalize({ modules: [module] }))).toContain(
      "PH-DM-DEFAULT-UNSUPPORTED",
    );
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
        specifications: {
          auxiliaryTypes: [second],
          global: {
            schema: ph.object("CollideState", {
              fields: { shared: ph.ref(first) },
            }),
            initialValue: { shared: null },
          },
          local: { schema: null, initialValue: {} },
        },
      }).finalize({ modules: [] }),
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
      model.finalize({ modules: [module] }),
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
  // An auxiliary input no operation reaches, and a nested input two
  // operations share: the two shapes that used to fall through the segment
  // assignment.
  const Orphan = ph.input("OrphanInput", { fields: { id: ph.OID() } });
  const model = defineDocumentModel({
    id: "test/segments",
    name: "Segments",
    description: "",
    extension: "seg",
    version: 1,
    author: { name: "Powerhouse" },
    specifications: {
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
          // The same type both roots reach.
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
  const Segments = model.finalize({ modules: [module] });
  const specification = Segments.definition.specifications.at(0);
  if (specification === undefined) throw new Error("no specification");
  const stored = Segments.documentModel.global.specifications.at(0);
  if (stored === undefined) throw new Error("no stored specification");

  /** The way `codegen/src/codegen/graphql.ts` assembles a stored spec. */
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
    // Every type the structured definition records is declared somewhere.
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
    // A nested named input travels with the operation segment that needs it.
    const patch = stored.modules[0].operations[0].schema ?? "";
    expect(patch).toContain("input PatchInput {");
    expect(patch).toContain("input NestedPatch {");
    expect(stored.modules[0].operations[2].schema).toBe(
      "input ClearInput {\n  _empty: Boolean\n}\n",
    );
    // The shared nested input is declared once, with the first operation that
    // reaches it; the second references it.
    expect(stored.modules[0].operations[1].schema).toBe(
      "input RepatchInput {\n  patch: NestedPatch\n}\n",
    );
    // An input no operation reaches is declared in the global segment, which
    // is where `create-schema.ts` looks for one.
    expect(stored.state.global.schema).toContain("input OrphanInput {");
  });

  it("declares an input-only enum in the global segment", () => {
    // Both consumers read the state segments and every operation segment
    // (`reactor-api/src/utils/create-schema.ts` even re-extracts input
    // definitions from the state schema), so a non-input type declared once in
    // the global segment reaches both. This is also where the schema-first
    // corpus keeps a shared enum.
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
        specifications: {
          global: {
            schema: ph.object("MemberlessState", {
              fields: { thing: ph.ref(schema as never) },
            }),
            initialValue: { thing: null },
          },
          local: { schema: null, initialValue: {} },
        },
      }).finalize({ modules: [] });
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
