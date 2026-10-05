import type { DefinitionDiagnostic } from "@powerhousedao/shared/document-model";
import { describe, expect, expectTypeOf, it } from "vitest";
import { DocumentModelDefinitionError } from "../../src/definition/diagnostics.js";
import { ph } from "../../src/definition/field.js";
import { defineDocumentModel } from "../../src/definition/model.js";
import { emitDeclaration } from "./helpers/declaration-emit.js";
import { Invoice, invoice } from "./fixtures/invoice.js";

function diagnosticsOf(run: () => unknown): readonly DefinitionDiagnostic[] {
  try {
    run();
  } catch (error) {
    if (error instanceof DocumentModelDefinitionError) return error.diagnostics;
    throw error;
  }
  throw new Error("expected a DocumentModelDefinitionError");
}

const model = defineDocumentModel({
  id: "test/modules",
  name: "Modules",
  description: "",
  extension: "mod",
  version: 1,
  author: { name: "Powerhouse" },
  specifications: {
    global: {
      schema: ph.object("ModulesState", {
        fields: { title: ph.String({ required: true }) },
      }),
      initialValue: { title: "" },
    },
    local: {
      schema: ph.object("ModulesLocalState", {
        fields: { note: ph.String() },
      }),
      initialValue: { note: null },
    },
  },
});

describe("context.module and the scope builders", () => {
  it("derives the operation input name from the operation key", () => {
    const specification = Invoice.definition.specifications[0];
    expect(
      specification.modules.flatMap((module) =>
        module.operations.map((operation) => operation.input?.name),
      ),
    ).toStrictEqual([
      "AddLineItemInput",
      "RemoveLineItemInput",
      "IssueInput",
      "ClearInput",
      "PatchInput",
      "SetDraftNoteInput",
    ]);
  });

  it("narrows state to the selected scope", () => {
    const scoped = model.module("scoped", {
      operations: ({ global, local }) => ({
        setTitle: global({
          input: ph.input({ fields: { title: ph.String({ required: true }) } }),
          reduce(state, input) {
            state.title = input.title;
            expectTypeOf(state).toHaveProperty("title");
          },
        }),
        setNote: local({
          input: ph.input({ fields: { note: ph.String() } }),
          reduce(state, input) {
            state.note = input.note ?? null;
            // @ts-expect-error a local reducer cannot see a global field
            state.title = "";
          },
        }),
      }),
    });
    const finalized = model.finalize({ modules: [scoped] });
    expect(
      finalized.definition.specifications[0]?.modules[0]?.operations.map(
        (operation) => operation.scope,
      ),
    ).toStrictEqual(["global", "local"]);
  });

  it("gives an explicit empty input a working, optional-argument creator", () => {
    const cleared = Invoice.actions.clear();
    const clearedWithObject = Invoice.actions.clear({});
    expect(cleared.type).toBe("CLEAR");
    expect(cleared.input).toStrictEqual({});
    expect({ ...cleared, id: "", timestampUtcMs: "" }).toStrictEqual({
      ...clearedWithObject,
      id: "",
      timestampUtcMs: "",
    });
    expect(cleared.scope).toBe("global");
  });

  it("rejects an operation with no input, naming the empty-input repair", () => {
    const diagnostics = diagnosticsOf(() =>
      model.module("missing", {
        operations: ({ global }) => ({
          // @ts-expect-error an operation must declare an input descriptor
          broken: global({ reduce() {} }),
        }),
      }),
    );
    expect(diagnostics[0]).toMatchObject({
      code: "PH-DM-DECLARATION-INVALID",
      received: "absent",
    });
    expect(diagnostics[0]?.repair).toContain("ph.input({ fields: {} })");
  });

  it("defaults template and reducerTemplate to null and keeps an authored empty string", () => {
    const templates = model.module("templates", {
      operations: ({ global }) => ({
        withDefaults: global({
          input: ph.input({ fields: {} }),
          reduce() {},
        }),
        withEmptyStrings: global({
          input: ph.input({ fields: {} }),
          template: "",
          reducerTemplate: "",
          reduce() {},
        }),
      }),
    });
    const operations =
      model.finalize({ modules: [templates] }).definition.specifications[0]
        ?.modules[0]?.operations ?? [];
    expect(operations[0]).toMatchObject({ template: null, reducer: null });
    expect(operations[1]).toMatchObject({ template: "", reducer: "" });
    const stored =
      model.finalize({ modules: [templates] }).documentModel.global
        .specifications[0]?.modules[0]?.operations ?? [];
    expect(stored[0]?.template).toBeNull();
    expect(stored[1]?.template).toBe("");
  });

  it("exposes a typed action and dispatch on the reducer context", () => {
    let seen: unknown;
    const contextual = model.module("contextual", {
      operations: ({ global }) => ({
        setTitle: global({
          input: ph.input({ fields: { title: ph.String({ required: true }) } }),
          reduce(state, input, ctx) {
            expectTypeOf(ctx.action.input.title).toEqualTypeOf<string>();
            expectTypeOf(ctx.dispatch).toBeNullable();
            seen = {
              type: ctx.action.type,
              scope: ctx.action.scope,
              input: ctx.action.input,
              dispatch: typeof ctx.dispatch,
            };
            state.title = input.title;
          },
        }),
      }),
    });
    const finalized = model.finalize({ modules: [contextual] });
    const document = finalized.utils.createDocument();
    const next = finalized.reducer(
      document,
      finalized.actions.setTitle({ title: "hello" }),
      () => undefined,
    );
    expect(next.state.global.title).toBe("hello");
    expect(seen).toStrictEqual({
      type: "SET_TITLE",
      scope: "global",
      input: { title: "hello" },
      dispatch: "function",
    });
  });

  it("rejects one operation token assigned to two keys", () => {
    const diagnostics = diagnosticsOf(() =>
      model.module("repeated", {
        operations: ({ global }) => {
          const token = global({
            input: ph.input({ fields: {} }),
            reduce() {},
          });
          return { first: token, second: token };
        },
      }),
    );
    expect(diagnostics[0]).toMatchObject({
      code: "PH-DM-DECLARATION-INVALID",
      path: ["module", "operations", "second"],
    });
    expect(diagnostics[0]?.related?.[0]?.path).toStrictEqual([
      "module",
      "operations",
      "first",
    ]);
  });

  it("rejects an unrecognized operation token", () => {
    const diagnostics = diagnosticsOf(() =>
      model.module("forged", {
        operations: () => ({
          forged: {
            kind: "powerhouse.document-model-operation",
          } as never,
        }),
      }),
    );
    expect(diagnostics[0]?.code).toBe("PH-DM-DECLARATION-INVALID");
    expect(diagnostics[0]?.repair).toContain("scope builder");
  });

  it("rejects a module declared without an operations callback", () => {
    const diagnostics = diagnosticsOf(() =>
      model.module("callbackless", { operations: {} as never }),
    );
    expect(diagnostics[0]?.repair).toContain("({ global, local })");
  });

  it("emits no reducer implementation in a module token declaration", () => {
    const { declaration, diagnostics } = emitDeclaration(
      [
        'import { ph } from "../../src/definition/field.js";',
        'import { invoice } from "./fixtures/invoice.js";',
        'export const extra = invoice.module("extra", {',
        "  operations: ({ global }) => ({",
        "    note: global({",
        "      input: ph.input({ fields: { note: ph.String() } }),",
        "      reduce(state, input) {",
        "        state.number = input.note ?? state.number;",
        "      },",
        "    }),",
        "  }),",
        "});",
      ].join("\n"),
    );
    expect(diagnostics).toStrictEqual([]);
    expect(declaration).not.toContain("reduce");
    expect(declaration).toContain("ModelModuleToken");
  });

  it("keeps the module and operation tokens opaque", () => {
    const token = model.module("opaque", { operations: () => ({}) });
    expect(Object.keys(token)).toStrictEqual(["kind"]);
    expect(typeof invoice.module).toBe("function");
  });
});
