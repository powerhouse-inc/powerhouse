import { describe, expect, expectTypeOf, it } from "vitest";
import {
  type ActionOf,
  defineDocumentModel,
  materialize,
  ph,
} from "../../../src/definition/index.js";
import { diagnosticsOf } from "../helpers/diagnostics.js";

const model = defineDocumentModel({
  id: "test/errors",
  name: "Errors",
  description: "",
  extension: "err",
  version: 1,
  author: { name: "Powerhouse" },
  scopes: {
    global: {
      schema: ph.object("ErrorsState", {
        fields: { count: ph.Int({ required: true }) },
      }),
      initialValue: { count: 0 },
    },
    local: { schema: null, initialValue: {} },
  },
});

const seen: Record<string, Record<string, unknown>> = {};

const module = model.module("counters", {
  operations: ({ global }) => ({
    increment: global({
      input: ph.input({ fields: { by: ph.Int({ required: true }) } }),
      errors: {
        LimitReached: {
          code: "LIMIT_REACHED",
          description: "The counter is at its limit.",
          template: "",
        },
        Unauthorized: {},
      },
      reduce(state, input, ctx) {
        seen.increment = { ...ctx.errors };
        expectTypeOf(
          new ctx.errors.LimitReached().errorCode,
        ).toEqualTypeOf<"LIMIT_REACHED">();
        expectTypeOf(
          new ctx.errors.Unauthorized().errorCode,
        ).toEqualTypeOf<"Unauthorized">();
        if (input.by > 10) throw new ctx.errors.LimitReached();
        if (input.by < 0) {
          throw new ctx.errors.Unauthorized("negative steps are not allowed");
        }
        state.count += input.by;
      },
    }),
    decrement: global({
      input: ph.input({ fields: { by: ph.Int({ required: true }) } }),
      errors: {
        LimitReached: {
          name: "DecrementLimit",
          description: "A different occurrence of the same reducer key.",
          template: null,
        },
      },
      reduce(state, input, ctx) {
        seen.decrement = { ...ctx.errors };
        expectTypeOf(
          new ctx.errors.LimitReached().errorCode,
        ).toEqualTypeOf<"LimitReached">();
        if (state.count - input.by < 0) throw new ctx.errors.LimitReached();
        state.count -= input.by;
      },
    }),
    reset: global({
      input: ph.input({ fields: { mode: ph.String({ required: true }) } }),
      errors: {
        Unauthorized: { description: "Another occurrence of one class." },
        Blank: { code: "" },
      },
      reduce(state, input, ctx) {
        seen.reset = { ...ctx.errors };
        expectTypeOf(new ctx.errors.Blank().errorCode).toEqualTypeOf<"Blank">();
        if (input.mode === "blank") throw new ctx.errors.Blank();
        state.count = 0;
      },
    }),
  }),
});

const Errors = materialize(model.version({ modules: [module] }));
const operations =
  Errors.definition.specifications[0]?.modules[0]?.operations ?? [];
const [increment, decrement] = operations;

function dispatch(action: ActionOf<typeof Errors>) {
  const document = Errors.utils.createDocument();
  const next = Errors.reducer(document, action);
  return next;
}

describe("operation errors", () => {
  it("keeps one complete stored occurrence under every operation", () => {
    expect(increment.errors).toStrictEqual([
      {
        id: increment.errors[0]?.id,
        key: "LimitReached",
        code: "LIMIT_REACHED",
        name: "LimitReached",
        description: "The counter is at its limit.",
        template: "",
      },
      {
        id: increment.errors[1]?.id,
        key: "Unauthorized",
        code: "Unauthorized",
        name: "Unauthorized",
        description: null,
        template: null,
      },
    ]);
    expect(decrement.errors).toStrictEqual([
      {
        id: decrement.errors[0]?.id,
        key: "LimitReached",
        code: "LimitReached",
        name: "DecrementLimit",
        description: "A different occurrence of the same reducer key.",
        template: null,
      },
    ]);
    expect(increment.errors[0]?.id).not.toBe(decrement.errors[0]?.id);
  });

  it("reuses one runtime class per generated class name within a module", () => {
    dispatch(Errors.actions.increment({ by: 1 }));
    dispatch(Errors.actions.decrement({ by: 0 }));
    dispatch(Errors.actions.reset({ mode: "" }));
    expect(seen.increment.Unauthorized).toBe(seen.reset.Unauthorized);
    expect(seen.increment.LimitReached).not.toBe(seen.decrement.LimitReached);
    const names = (classes: Record<string, unknown>) =>
      Object.fromEntries(
        Object.entries(classes).map(([key, value]) => [
          key,
          (value as { name: string }).name,
        ]),
      );
    expect(names(seen.increment)).toStrictEqual({
      LimitReached: "LimitReached",
      Unauthorized: "Unauthorized",
    });
    expect(names(seen.decrement)).toStrictEqual({
      LimitReached: "DecrementLimit",
    });
    expect(names(seen.reset)).toStrictEqual({
      Unauthorized: "Unauthorized",
      Blank: "Blank",
    });
  });

  it("preserves declaration order", () => {
    expect(increment.errors.map((error) => error.key)).toStrictEqual([
      "LimitReached",
      "Unauthorized",
    ]);
  });

  it("persists the generated class name and stored code of a thrown error", () => {
    const identity = (result: ReturnType<typeof dispatch>) => {
      const operation = result.operations.global.at(-1);
      return {
        error: operation?.error,
        errorName: operation?.errorName,
        errorCode: operation?.errorCode,
      };
    };
    expect(identity(dispatch(Errors.actions.increment({ by: 11 })))).toEqual({
      error: "LimitReached",
      errorName: "LimitReached",
      errorCode: "LIMIT_REACHED",
    });
    expect(identity(dispatch(Errors.actions.increment({ by: -1 })))).toEqual({
      error: "negative steps are not allowed",
      errorName: "Unauthorized",
      errorCode: "Unauthorized",
    });
    expect(identity(dispatch(Errors.actions.decrement({ by: 1 })))).toEqual({
      error: "DecrementLimit",
      errorName: "DecrementLimit",
      errorCode: "LimitReached",
    });
    expect(identity(dispatch(Errors.actions.reset({ mode: "blank" })))).toEqual(
      { error: "Blank", errorName: "Blank", errorCode: "Blank" },
    );
  });

  it("round-trips null and an empty string distinctly", () => {
    expect(increment.errors[0]?.template).toBe("");
    expect(decrement.errors[0]?.template).toBeNull();
    expect(increment.errors[1]?.description).toBeNull();
    const stored =
      Errors.documentModel.global.specifications[0]?.modules[0]?.operations ??
      [];
    expect(stored[0]?.errors[0]?.template).toBe("");
    expect(stored[1]?.errors[0]?.template).toBeNull();
  });

  it("persists the default message and an explicit message", () => {
    const withDefault = dispatch(Errors.actions.increment({ by: 11 }));
    expect(withDefault.operations.global.at(-1)?.error).toBe("LimitReached");
    expect(withDefault.state.global.count).toBe(0);
    const explicit = dispatch(Errors.actions.increment({ by: -1 }));
    expect(explicit.operations.global.at(-1)?.error).toBe(
      "negative steps are not allowed",
    );
  });

  it("exposes only the classes one operation declares", () => {
    dispatch(Errors.actions.increment({ by: 1 }));
    dispatch(Errors.actions.decrement({ by: 0 }));
    expect(Object.keys(seen.increment)).toStrictEqual([
      "LimitReached",
      "Unauthorized",
    ]);
    expect(Object.keys(seen.decrement)).toStrictEqual(["LimitReached"]);
  });

  it("rejects an error key that is not its own class name", () => {
    const model = defineDocumentModel({
      id: "test/error-keys",
      name: "ErrorKeys",
      description: "",
      extension: "ek",
      version: 1,
      author: { name: "Powerhouse" },
      scopes: {
        global: {
          schema: ph.object("ErrorKeysState", {
            fields: { count: ph.Int({ required: true }) },
          }),
          initialValue: { count: 0 },
        },
        local: { schema: null, initialValue: {} },
      },
    });
    const diagnostics = diagnosticsOf(() =>
      model.module("counters", {
        operations: ({ global }) => ({
          increment: global({
            input: ph.input({ fields: { by: ph.Int({ required: true }) } }),
            errors: { limitReached: {} },
            reduce() {},
          }),
        }),
      }),
    );
    expect(diagnostics[0]).toMatchObject({
      code: "PH-DM-DECLARATION-INVALID",
      expected: "LimitReached",
      received: "limitReached",
    });
    expect(diagnostics[0]?.repair).toContain('"LimitReached"');
    expect(diagnostics[0]?.message).toContain("persists");
  });

  it("derives error identity from the model, module, operation, and key", () => {
    const other = defineDocumentModel({
      id: "test/errors",
      name: "Errors",
      description: "",
      extension: "err",
      version: 1,
      author: { name: "Powerhouse" },
      scopes: {
        global: {
          schema: ph.object("ErrorsState", {
            fields: { count: ph.Int({ required: true }) },
          }),
          initialValue: { count: 0 },
        },
        local: { schema: null, initialValue: {} },
      },
    });
    const same = other.module("counters", {
      operations: ({ global }) => ({
        increment: global({
          input: ph.input({ fields: { by: ph.Int({ required: true }) } }),
          errors: { LimitReached: { code: "OTHER" } },
          reduce() {},
        }),
      }),
    });
    const rebuilt = materialize(other.version({ modules: [same] }));
    expect(
      rebuilt.definition.specifications[0]?.modules[0]?.operations[0]?.errors[0]
        ?.id,
    ).toBe(increment.errors[0]?.id);
  });

  describe("refuses an error class codegen could not generate", () => {
    const context = () =>
      defineDocumentModel({
        id: "test/error-classes",
        name: "ErrorClasses",
        description: "",
        extension: "ec",
        version: 1,
        author: { name: "Powerhouse" },
        scopes: {
          global: {
            schema: ph.object("ErrorClassesState", {
              fields: { count: ph.Int({ required: true }) },
            }),
            initialValue: { count: 0 },
          },
          local: { schema: null, initialValue: {} },
        },
      });

    it("with two codes for one class in a module", () => {
      const model = context();
      const module = model.module("counters", {
        operations: ({ global }) => ({
          first: global({
            input: ph.input({ fields: {} }),
            errors: { Limit: { code: "FIRST" } },
            reduce() {},
          }),
          second: global({
            input: ph.input({ fields: {} }),
            errors: { Other: { name: "limit", code: "SECOND" } },
            reduce() {},
          }),
        }),
      });
      const diagnostics = diagnosticsOf(() =>
        model.version({ modules: [module] }),
      );
      expect(
        diagnostics.map(({ code, path, expected, received, related }) => ({
          code,
          path,
          expected,
          received,
          related: related?.map((entry) => entry.path),
        })),
      ).toStrictEqual([
        {
          code: "PH-DM-DECLARATION-INVALID",
          path: ["modules", 0, "operations", 1, "errors", "Other", "code"],
          expected: "FIRST",
          received: "SECOND",
          related: [["modules", 0, "operations", 0, "errors", "Limit", "code"]],
        },
      ]);
      expect(diagnostics[0]?.message).toContain("Limit");
    });

    it("with whitespace around a code", () => {
      const model = context();
      const module = model.module("counters", {
        operations: ({ global }) => ({
          first: global({
            input: ph.input({ fields: {} }),
            errors: {
              Padded: { code: " LIMIT " },
              Unicode: { code: "\u00a0LIMIT\u00a0" },
              Blank: { code: "\t " },
              Plain: { code: "LIMIT" },
              Empty: { code: "" },
            },
            reduce(_state, _input, ctx) {
              expectTypeOf(
                new ctx.errors.Padded().errorCode,
              ).toEqualTypeOf<" LIMIT ">();
              expectTypeOf(
                new ctx.errors.Plain().errorCode,
              ).toEqualTypeOf<"LIMIT">();
              expectTypeOf(
                new ctx.errors.Empty().errorCode,
              ).toEqualTypeOf<"Empty">();
            },
          }),
        }),
      });
      expect(
        diagnosticsOf(() => model.version({ modules: [module] })).map(
          ({ code, path, received, repair }) => ({
            code,
            path,
            received,
            repair,
          }),
        ),
      ).toStrictEqual(
        [
          ["Blank", "\t "],
          ["Padded", " LIMIT "],
          ["Unicode", "\u00a0LIMIT\u00a0"],
        ].map(([key, received]) => ({
          code: "PH-DM-DECLARATION-INVALID",
          path: ["modules", 0, "operations", 0, "errors", key, "code"],
          received,
          repair:
            "Remove the whitespace around the code, or leave the code empty so the class name is the code.",
        })),
      );
    });

    it("with a name that derives no class name", () => {
      const model = context();
      const module = model.module("counters", {
        operations: ({ global }) => ({
          first: global({
            input: ph.input({ fields: {} }),
            errors: { Unnamed: { name: "" }, Numbered: { name: "1st" } },
            reduce() {},
          }),
        }),
      });
      expect(
        diagnosticsOf(() => model.version({ modules: [module] })).map(
          ({ code, path, received }) => ({ code, path, received }),
        ),
      ).toStrictEqual([
        {
          code: "PH-DM-DECLARATION-INVALID",
          path: ["modules", 0, "operations", 0, "errors", "Numbered", "name"],
          received: "1st",
        },
        {
          code: "PH-DM-DECLARATION-INVALID",
          path: ["modules", 0, "operations", 0, "errors", "Unnamed", "name"],
          received: "",
        },
      ]);
    });
  });
});
