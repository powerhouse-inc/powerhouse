import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  defineDocumentModel,
  materialize,
  ph,
} from "../../../src/definition/index.js";
import { defineScalar } from "../../../src/scalars/define-scalar.js";
import { emitDeclaration } from "../dsl/helpers/declaration-emit.js";

const operationTypes = [
  ["setTitle", "SET_TITLE"],
  ["setUrl", "SET_URL"],
  ["url", "URL"],
  ["setV2Title", "SET_V2_TITLE"],
  ["set2Fa", "SET2_FA"],
  ["set_2Fa", "SET_2_FA"],
  ["v2", "V2"],
  ["setUrl2Value", "SET_URL2_VALUE"],
  ["set_2Value", "SET_2_VALUE"],
  ["setApiV2", "SET_API_V2"],
  ["setIpv4Address", "SET_IPV4_ADDRESS"],
] as const;

const inferenceModel = `
import { defineDocumentModel, materialize, ph } from "../../src/definition/index.js";
const context = defineDocumentModel({
  id: "test/inference", name: "Inference", description: "", extension: "test", version: 1,
  author: { name: "Test" },
  specifications: {
    global: { schema: ph.object("InferenceState", { fields: { value: ph.String({ required: true }) } }), initialValue: { value: "" } },
    local: { schema: null, initialValue: {} },
  },
});
`;

describe("compiler regressions", () => {
  it("creates independent nested global and local defaults", () => {
    const Item = ph.object("IsolatedItem", {
      fields: { value: ph.String({ required: true }) },
    });
    const context = defineDocumentModel({
      id: "test/isolated",
      name: "Isolated",
      description: "",
      extension: "test",
      version: 1,
      author: { name: "Test" },
      specifications: {
        global: {
          schema: ph.object("IsolatedState", {
            fields: {
              items: ph.list(ph.ref(Item, { required: true }), {
                required: true,
              }),
            },
          }),
          initialValue: { items: [{ value: "default" }] },
        },
        local: {
          schema: ph.object("IsolatedLocalState", {
            fields: { item: ph.ref(Item, { required: true }) },
          }),
          initialValue: { item: { value: "local" } },
        },
      },
    });
    const model = materialize(context.version({ modules: [] }));
    const before = model.utils.createDocument();
    const edited = model.utils.createState();
    edited.global.items[0].value = "changed";
    edited.local.item.value = "changed";
    expect(before.state.global).toStrictEqual({
      items: [{ value: "default" }],
    });
    expect(before.state.local).toStrictEqual({ item: { value: "local" } });
    expect(model.utils.createDocument().state.global).toStrictEqual({
      items: [{ value: "default" }],
    });
    expect(model.utils.createState().local).toStrictEqual({
      item: { value: "local" },
    });
    const supplied = [{ value: "supplied" }];
    expect(
      model.utils.createState({ global: { items: supplied } }).global.items,
    ).toBe(supplied);
  });

  it("keeps action discriminants, input narrowing, and base actions in the types", () => {
    const invoice = resolve(import.meta.dirname, "../fixtures/invoice.js");
    const result = emitDeclaration(`
import { Invoice } from ${JSON.stringify(invoice)};
import type { ActionOf } from "../../src/definition/index.js";
const issue = Invoice.actions.issue({ issuedAt: "2026-01-01T00:00:00Z" });
const type: "ISSUE" = issue.type;
declare const action: ActionOf<typeof Invoice>;
if (action.type === "ISSUE") { const issuedAt: string = action.input.issuedAt; }
if (action.type === "SET_DRAFT_NOTE") { const scope: "local" = action.scope; }
// @ts-expect-error an issue action is global
if (action.type === "ISSUE") { const scope: "local" = action.scope; }
const noop: "NOOP" = Invoice.actions.noop().type;
const clear: "CLEAR" = Invoice.actions.clear().type;
`);
    expect(result.diagnostics).toStrictEqual([]);
  });

  it("types and dispatches canonical digit and acronym keys with one action type", () => {
    const context = defineDocumentModel({
      id: "test/inference",
      name: "Inference",
      description: "",
      extension: "test",
      version: 1,
      author: { name: "Test" },
      specifications: {
        global: {
          schema: ph.object("InferenceState", {
            fields: { value: ph.String({ required: true }) },
          }),
          initialValue: { value: "" },
        },
        local: { schema: null, initialValue: {} },
      },
    });
    const operations = context.module("operations", {
      operations: ({ global }) =>
        Object.fromEntries(
          operationTypes.map(([key]) => [
            key,
            global({ input: ph.input({ fields: {} }), reduce() {} }),
          ]),
        ),
    });
    const model = materialize(context.version({ modules: [operations] }));
    const actions = model.actions as unknown as Record<
      string,
      () => { type: string }
    >;
    expect(
      operationTypes.map(([key]) => [key, actions[key]().type]),
    ).toStrictEqual(operationTypes.map(([key, type]) => [key, type]));

    const result = emitDeclaration(`${inferenceModel}
const operations = context.module("operations", {
  operations: ({ global }) => ({
    ${operationTypes.map(([key]) => `${key}: global({ input: ph.input({ fields: {} }), reduce() {} }),`).join("\n    ")}
  }),
});
const model = materialize(context.version({ modules: [operations] }));
${operationTypes.map(([key, type]) => `const ${key}: "${type}" = model.actions.${key}().type;`).join("\n")}
`);
    expect(result.diagnostics).toStrictEqual([]);
  });

  it("parses project-scalar input for the reducer and persists the raw input, as the generated reducer does", () => {
    const Shout = defineScalar({
      name: "Shout",
      schema: z.string().transform((value) => value.toUpperCase()),
    });
    const Entry = ph.input("EntryInput", {
      fields: { shout: ph.scalar(Shout, { required: true }) },
    });
    const context = defineDocumentModel({
      id: "test/transformed",
      name: "Transformed",
      description: "",
      extension: "test",
      version: 1,
      author: { name: "Test" },
      specifications: {
        global: {
          schema: ph.object("TransformedState", {
            fields: {
              value: ph.scalar(Shout, { required: true }),
              entries: ph.list(ph.String({ required: true }), {
                required: true,
              }),
              label: ph.String(),
            },
          }),
          initialValue: { value: "first", entries: [], label: null },
        },
        local: { schema: null, initialValue: {} },
      },
    });
    const seen: Record<string, { input: unknown; actionInput: unknown }> = {};
    const values = context.module("values", {
      operations: ({ global }) => ({
        setValue: global({
          input: ph.input({
            fields: { value: ph.scalar(Shout, { required: true }) },
          }),
          reduce(state, input, { action }) {
            seen.setValue = { input, actionInput: action.input };
            state.value = input.value;
          },
        }),
        addEntries: global({
          input: ph.input({
            fields: {
              entries: ph.list(ph.ref(Entry, { required: true }), {
                required: true,
              }),
            },
          }),
          reduce(state, input) {
            state.entries.push(...input.entries.map((entry) => entry.shout));
          },
        }),
        setLabel: global({
          input: ph.input({ fields: { label: ph.String() } }),
          reduce(state, input, { action }) {
            seen.setLabel = { input, actionInput: action.input };
            state.label = input.label;
          },
        }),
      }),
    });
    const model = materialize(context.version({ modules: [values] }));

    const setValue = model.actions.setValue({ value: "quiet" });
    const valued = model.reducer(model.utils.createDocument(), setValue);
    expect(valued.state.global.value).toBe("QUIET");
    expect(valued.operations.global[0]?.action.input).toStrictEqual({
      value: "quiet",
    });
    expect(seen.setValue).toStrictEqual({
      input: { value: "QUIET" },
      actionInput: { value: "QUIET" },
    });
    expect(setValue.input).toStrictEqual({ value: "quiet" });

    const nested = model.reducer(
      model.utils.createDocument(),
      model.actions.addEntries({ entries: [{ shout: "a" }, { shout: "b" }] }),
    );
    expect(nested.state.global.entries).toStrictEqual(["A", "B"]);
    expect(nested.operations.global[0]?.action.input).toStrictEqual({
      entries: [{ shout: "a" }, { shout: "b" }],
    });

    const setLabel = model.actions.setLabel({ label: "plain" });
    model.reducer(model.utils.createDocument(), setLabel);
    expect(seen.setLabel.input).toBe(setLabel.input);
    expect(seen.setLabel.actionInput).toBe(setLabel.input);
    expect(model.utils.createDocument().state.global.value).toBe("first");
  });
});
