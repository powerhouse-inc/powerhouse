import type { DefinitionDiagnostic } from "@powerhousedao/shared/document-model";
import { describe, expect, it } from "vitest";
import { ph } from "../../src/definition/field.js";
import {
  defineDocumentModel,
  type ActionOf,
} from "../../src/definition/model.js";

const model = defineDocumentModel({
  id: "test/errors",
  name: "Errors",
  description: "",
  extension: "err",
  version: 1,
  author: { name: "Powerhouse" },
  specifications: {
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
        if (state.count - input.by < 0) throw new ctx.errors.LimitReached();
        state.count -= input.by;
      },
    }),
  }),
});

const Errors = model.finalize({ modules: [module] });
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
    // Two occurrences of one reducer-facing key keep distinct identity.
    expect(increment.errors[0]?.id).not.toBe(decrement.errors[0]?.id);
  });

  it("reuses one runtime class per key within a module", () => {
    dispatch(Errors.actions.increment({ by: 1 }));
    dispatch(Errors.actions.decrement({ by: 0 }));
    expect(seen.increment.LimitReached).toBe(seen.decrement.LimitReached);
  });

  it("preserves declaration order", () => {
    expect(increment.errors.map((error) => error.key)).toStrictEqual([
      "LimitReached",
      "Unauthorized",
    ]);
  });

  it("keeps a stored code that differs from the name and from the key", () => {
    expect(increment.errors[0]?.code).toBe("LIMIT_REACHED");
    expect(increment.errors[0]?.name).toBe("LimitReached");
    const thrown = dispatch(Errors.actions.increment({ by: 11 }));
    const operation = thrown.operations.global.at(-1);
    expect(operation?.error).toBe("LimitReached");
    // The runtime errorCode follows the reducer-facing key, not the stored code.
    const ErrorClass = seen.increment.LimitReached as new () => {
      readonly errorCode: string;
      readonly message: string;
    };
    expect(new ErrorClass().errorCode).toBe("LimitReached");
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
      specifications: {
        global: {
          schema: ph.object("ErrorKeysState", {
            fields: { count: ph.Int({ required: true }) },
          }),
          initialValue: { count: 0 },
        },
        local: { schema: null, initialValue: {} },
      },
    });
    let caught: unknown;
    try {
      model.module("counters", {
        operations: ({ global }) => ({
          increment: global({
            input: ph.input({ fields: { by: ph.Int({ required: true }) } }),
            errors: { limitReached: {} },
            reduce() {},
          }),
        }),
      });
    } catch (error) {
      caught = error;
    }
    const diagnostics = (
      caught as { readonly diagnostics: readonly DefinitionDiagnostic[] }
    ).diagnostics;
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
      specifications: {
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
    const rebuilt = other.finalize({ modules: [same] });
    expect(
      rebuilt.definition.specifications[0]?.modules[0]?.operations[0]?.errors[0]
        ?.id,
    ).toBe(increment.errors[0]?.id);
  });
});
