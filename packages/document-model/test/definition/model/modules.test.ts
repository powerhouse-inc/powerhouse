import { describe, expect, expectTypeOf, it } from "vitest";
import {
  defineDocumentModel,
  materialize,
  ph,
} from "../../../src/definition/index.js";
import { Invoice, invoice } from "../fixtures/invoice.js";
import { codesOf, diagnosticsOf } from "../helpers/diagnostics.js";

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
    const materialized = materialize(model.version({ modules: [scoped] }));
    expect(
      materialized.definition.specifications[0]?.modules[0]?.operations.map(
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
      materialize(model.version({ modules: [templates] })).definition
        .specifications[0]?.modules[0]?.operations ?? [];
    expect(operations[0]).toMatchObject({ template: null, reducer: null });
    expect(operations[1]).toMatchObject({ template: "", reducer: "" });
    const stored =
      materialize(model.version({ modules: [templates] })).documentModel.global
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
    const materialized = materialize(model.version({ modules: [contextual] }));
    const document = materialized.utils.createDocument();
    const next = materialized.reducer(
      document,
      materialized.actions.setTitle({ title: "hello" }),
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

  describe("accepts only the tokens its own operations callback built", () => {
    const foreignEntry = [
      ["PH-DM-DECLARATION-INVALID", "module.operations.mutate"],
    ];
    const other = defineDocumentModel({
      id: "test/other",
      name: "Other",
      description: "",
      extension: "oth",
      version: 1,
      author: { name: "Powerhouse" },
      specifications: {
        global: {
          schema: ph.object("OtherState", {
            fields: { count: ph.Int({ required: true }) },
          }),
          initialValue: { count: 0 },
        },
        local: { schema: null, initialValue: {} },
      },
    });

    it("refuses a token of another context", () => {
      let token: unknown;
      model.module("alpha", {
        operations: ({ global }) => {
          const built = global({
            input: ph.input({ fields: {} }),
            reduce(state) {
              state.title = "foreign";
            },
          });
          token = built;
          return { mutate: built };
        },
      });
      expect(
        codesOf(() =>
          other.module("beta", {
            operations: () => ({ mutate: token as never }),
          }),
        ),
      ).toStrictEqual(foreignEntry);
    });

    it("refuses a token of another module of the same context", () => {
      let token: unknown;
      model.module("first", {
        operations: ({ global }) => {
          const built = global({
            input: ph.input({ fields: {} }),
            reduce() {},
          });
          token = built;
          return { mutate: built };
        },
      });
      const diagnostics = diagnosticsOf(() =>
        model.module("second", {
          operations: () => ({ mutate: token as never }),
        }),
      );
      expect(
        diagnostics.map(({ code, path }) => [code, path.join(".")]),
      ).toStrictEqual(foreignEntry);
      expect(diagnostics[0]?.received).toBe(
        "an operation token this operations callback did not build",
      );
    });

    it("refuses a forged entry without reading its properties", () => {
      let reads = 0;
      const forged = {
        get kind() {
          reads += 1;
          throw new Error("the kind getter ran");
        },
      };
      const diagnostics = diagnosticsOf(() =>
        model.module("forged", {
          operations: () => ({ mutate: forged as never }),
        }),
      );
      expect(
        diagnostics.map(({ code, path, received }) => ({
          code,
          path,
          received,
        })),
      ).toStrictEqual([
        {
          code: "PH-DM-DECLARATION-INVALID",
          path: ["module", "operations", "mutate"],
          received: "object",
        },
      ]);
      expect(reads).toBe(0);
    });

    it("refuses a token whose declaration failed, instead of registering it", () => {
      let token: unknown;
      expect(
        codesOf(() =>
          model.module("failed", {
            operations: ({ global }) => {
              const built = global({
                input: ph.input({ fields: {} }),
                description: 123 as never,
                reduce(state) {
                  state.title = "registered";
                },
              });
              token = built;
              return { mutate: built };
            },
          }),
        ),
      ).toStrictEqual([
        ["PH-DM-DECLARATION-INVALID", "operations.description"],
      ]);
      expect(
        codesOf(() =>
          model.module("retry", {
            operations: () => ({ mutate: token as never }),
          }),
        ),
      ).toStrictEqual(foreignEntry);
    });

    it("refuses a rejected token in a later module, instead of dropping it", () => {
      let token: unknown;
      expect(
        codesOf(() =>
          model.module("rejected", {
            operations: ({ global }) => {
              token = global({ reduce() {} } as never);
              return { mutate: token as never };
            },
          }),
        ),
      ).toStrictEqual([["PH-DM-DECLARATION-INVALID", "operations.input"]]);
      expect(
        codesOf(() =>
          model.module("retry", {
            operations: () => ({ mutate: token as never }),
          }),
        ),
      ).toStrictEqual(foreignEntry);
    });
  });

  it("rejects a module declared without an operations callback", () => {
    const diagnostics = diagnosticsOf(() =>
      model.module("callbackless", { operations: {} as never }),
    );
    expect(diagnostics[0]?.repair).toContain("({ global, local })");
  });

  it("keeps the module and operation tokens opaque", () => {
    const token = model.module("opaque", { operations: () => ({}) });
    expect(Object.keys(token)).toStrictEqual(["kind"]);
    expect(typeof invoice.module).toBe("function");
  });
});
