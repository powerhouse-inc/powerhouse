import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import { defineDocumentModel, materialize, ph } from "document-model";
import { describe, expect, it } from "vitest";
import {
  formatActionFailures,
  operationSchemaSlice,
  validateActions,
} from "../src/tools/index.js";
import { Ledger } from "./fixtures/code-first-package/document-models/ledger.js";

const ledger = Ledger as unknown as DocumentModelModule;

describe("validateActions on a code-first model", () => {
  it("builds actions from their action types", () => {
    const { actions, failures } = validateActions(ledger, [
      { type: "SET_TITLE", input: { title: "Q3" } },
      { type: "ADD_AMOUNT", input: { amount: 5 } },
      { type: "SET_NOTE", input: { note: "draft" } },
      { type: "SET_NOTE", input: { note: "x" }, scope: "global" },
      { type: "ADD_AMOUNT", input: { amount: "five" } },
    ]);
    expect(
      actions.map(({ type, scope, input }) => ({ type, scope, input })),
    ).toEqual([
      { type: "SET_TITLE", scope: "global", input: { title: "Q3" } },
      { type: "ADD_AMOUNT", scope: "global", input: { amount: 5 } },
      { type: "SET_NOTE", scope: "local", input: { note: "draft" } },
    ]);
    expect(failures).toEqual([
      {
        index: 3,
        type: "SET_NOTE",
        code: "INVALID_ACTION",
        errors: [`scope "global" does not match the operation's scope "local"`],
      },
      {
        index: 4,
        type: "ADD_AMOUNT",
        code: "INVALID_ACTION",
        errors: ["amount: expected number, received string"],
      },
    ]);
  });

  it("accepts the stored operation name, as main does", () => {
    const { actions, failures } = validateActions(ledger, [
      { type: "SetTitle", input: { title: "x" } },
    ]);
    expect(failures).toEqual([]);
    expect(actions.map(({ type, input }) => ({ type, input }))).toEqual([
      { type: "SET_TITLE", input: { title: "x" } },
    ]);
  });

  it("matches allowedActionTypes by exact string, as main does", () => {
    const allowedBy = (allowed: string, type: string) =>
      validateActions(ledger, [{ type, input: { title: "x" } }], {
        allowedActionTypes: [allowed],
      }).failures;
    expect(allowedBy("SetTitle", "SetTitle")).toEqual([]);
    expect(allowedBy("SET_TITLE", "SET_TITLE")).toEqual([]);
    expect(allowedBy("SET_TITLE", "SetTitle")).toEqual([
      {
        index: 0,
        type: "SetTitle",
        code: "FORBIDDEN",
        errors: ["not an allowed action type (allowed: SET_TITLE)"],
      },
    ]);
    expect(allowedBy("SetTitle", "SET_TITLE")).toEqual([
      {
        index: 0,
        type: "SET_TITLE",
        code: "FORBIDDEN",
        errors: ["not an allowed action type (allowed: SetTitle)"],
      },
    ]);
  });

  it("suggests action types for an unknown one", () => {
    const { failures } = validateActions(ledger, [
      { type: "SET_TITEL", input: {} },
    ]);
    expect(formatActionFailures(failures, ledger)).toBe(
      `1 action failed:
  [0] SET_TITEL: unknown action type

Did you mean: SetTitle, SET_NAME, SetNote?
Valid action types for test/ledger:
  SetTitle, AddAmount, SetNote, SET_NAME, SET_PREFERRED_EDITOR, UNDO, REDO, NOOP`,
    );
  });

  it("shows the input schema of a shape failure sent by action type", () => {
    const { failures } = validateActions(ledger, [
      { type: "SET_TITLE", input: {} },
    ]);
    expect(formatActionFailures(failures, ledger)).toContain(
      "Input schema for SetTitle:\ninput SetTitleInput {\n  title: String!\n}\n",
    );
  });
});

describe("validateActions reads the module's current definition", () => {
  const failuresOf = (module: DocumentModelModule) =>
    validateActions(module, [{ type: "SET_TITLE", input: { title: "x" } }])
      .failures;
  const unknown = [
    {
      index: 0,
      type: "SET_TITLE",
      code: "INVALID_ACTION",
      errors: ["unknown action type"],
    },
  ];

  const unwalkable: {
    specifications: { types: { fields?: { type: unknown }[] }[] }[];
  } = structuredClone((ledger as { definition?: unknown }).definition) as never;
  const cyclic: Record<string, unknown> = { kind: "list", required: false };
  cyclic.item = cyclic;
  unwalkable.specifications[0].types.find(
    (type) => type.fields !== undefined,
  )!.fields![0].type = cyclic;

  it.each([
    ["removed", undefined],
    ["one it cannot walk", unwalkable],
  ])(
    "reads the stored model once the module's definition is %s",
    (_, definition) => {
      const module: DocumentModelModule & { definition?: unknown } = {
        ...ledger,
      };
      expect(failuresOf(module)).toEqual([]);
      module.definition = definition;
      expect(failuresOf(module)).toEqual(unknown);
    },
  );
});

describe("a model operation whose action type is a base action's", () => {
  const counter = defineDocumentModel({
    id: "test/counter",
    name: "Counter",
    description: "",
    extension: "counter",
    version: 1,
    author: { name: "Powerhouse" },
    scopes: {
      global: {
        schema: ph.object("CounterState", {
          fields: { total: ph.Int({ required: true }) },
        }),
        initialValue: { total: 0 },
      },
      local: { schema: null, initialValue: {} },
    },
  });
  const counters = counter.module("counters", {
    operations: ({ global }) => ({
      noop: global({
        input: ph.input({ fields: { amount: ph.Int({ required: true }) } }),
        reduce(state, input) {
          state.total += input.amount;
        },
      }),
    }),
  });
  const model = materialize(
    counter.version({ modules: [counters] }),
  ) as unknown as DocumentModelModule;

  it("builds NOOP from the model's own creator, keeping its input", () => {
    const { actions, failures } = validateActions(model, [
      { type: "NOOP", input: { amount: 2 } },
      { type: "NOOP", input: {} },
    ]);
    expect(
      actions.map(({ type, scope, input }) => ({ type, scope, input })),
    ).toEqual([{ type: "NOOP", scope: "global", input: { amount: 2 } }]);
    expect(failures).toEqual([
      {
        index: 1,
        type: "NOOP",
        code: "INVALID_ACTION",
        errors: ["amount: expected number, received undefined"],
      },
    ]);
  });

  it("describes NOOP with the model's input schema", () => {
    expect(operationSchemaSlice(model, "NOOP")).toEqual({
      name: "Noop",
      module: "Counters",
      scope: "global",
      schema: "input NoopInput {\n  amount: Int!\n}\n",
    });
  });

  it("keeps the base NOOP for a model without one", () => {
    const { actions } = validateActions(ledger, [{ type: "NOOP", input: {} }]);
    expect(actions.map(({ type, input }) => ({ type, input }))).toEqual([
      { type: "NOOP", input: {} },
    ]);
  });
});
