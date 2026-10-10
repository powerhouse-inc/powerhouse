import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ph } from "../../src/definition/field.js";
import { defineDocumentModel } from "../../src/definition/model.js";
import { deriveDocumentModelOperationNames } from "../../src/definition/naming.js";
import { defineScalar } from "../../src/definition/scalars/define-scalar.js";
import { emitDeclaration } from "./helpers/declaration-emit.js";

const declaration = `
import { ph } from "../../src/definition/field.js";
import { defineDocumentModel, type ActionOf } from "../../src/definition/model.js";
import { schemaFirstSpecification, type SchemaFirstSpecificationCompatibility } from "../../src/definition/compatibility.js";
const context = defineDocumentModel({
  id: "test/inference", name: "Inference", description: "", extension: "test", version: 1,
  author: { name: "Test" },
  specifications: {
    global: { schema: ph.object("InferenceState", { fields: { value: ph.String({ required: true }) } }), initialValue: { value: "" } },
    local: { schema: null, initialValue: {} },
  },
});
`;

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
    const model = context.finalize({ modules: [] });
    const before = model.utils.createDocument();
    const edited = model.utils.createState();
    edited.global.items[0]!.value = "changed";
    edited.local.item.value = "changed";
    expect(before.state.global).toEqual({ items: [{ value: "default" }] });
    expect(before.state.local).toEqual({ item: { value: "local" } });
    expect(model.utils.createDocument().state.global).toEqual({
      items: [{ value: "default" }],
    });
    expect(model.utils.createState().local).toEqual({
      item: { value: "local" },
    });
    const supplied = [{ value: "supplied" }];
    expect(
      model.utils.createState({ global: { items: supplied } }).global.items,
    ).toBe(supplied);
  });

  it("retains action discriminants, input narrowing, and base actions", () => {
    const result = emitDeclaration(`
import { Invoice } from "./fixtures/invoice.js";
import type { ActionOf } from "../../src/definition/model.js";
const issue = Invoice.actions.issue({ issuedAt: "2026-01-01T00:00:00Z" });
const type: "ISSUE" = issue.type;
declare const action: ActionOf<typeof Invoice>;
if (action.type === "ISSUE") { const issuedAt: string = action.input.issuedAt; }
if (action.type === "SET_DRAFT_NOTE") { const scope: "local" = action.scope; }
const noop: "NOOP" = Invoice.actions.noop().type;
const clear: "CLEAR" = Invoice.actions.clear().type;
`);
    expect(result.diagnostics).toEqual([]);
  });

  it("matches runtime action names for canonical digit and acronym keys", () => {
    for (const [key, type] of operationTypes) {
      expect(deriveDocumentModelOperationNames(key)).toMatchObject({
        actionType: type,
        creatorKey: key,
      });
    }
    const result = emitDeclaration(`${declaration}
const operations = context.module("operations", {
  operations: ({ global }) => ({
    ${operationTypes.map(([key]) => `${key}: global({ input: ph.input({ fields: {} }), reduce() {} }),`).join("\n")}
  }),
});
const model = context.finalize({ modules: [operations] });
${operationTypes.map(([key, type]) => `const ${key}: "${type}" = model.actions.${key}().type;`).join("\n")}
`);
    expect(result.diagnostics).toEqual([]);
  });

  it("keeps compatibility action overrides honest in finalized and family types", () => {
    const result = emitDeclaration(`${declaration}
import { defineDocumentModelFamily } from "../../src/definition/model.js";
const operations = context.module("operations", {
  operations: ({ global }) => ({
    archive: global({ input: ph.input({ fields: {} }), reduce() {} }),
    clear: global({ input: ph.input({ fields: {} }), reduce() {} }),
  }),
});
const compatibility = schemaFirstSpecification({ names: {
  "operation/operations/archive": { actionType: "ARCHIVE_V1" },
} });
const model = context.finalize({ modules: [operations], compatibility });
const archived: "ARCHIVE_V1" = model.actions.archive().type;
const clear: "CLEAR" = model.actions.clear().type;
const family = defineDocumentModelFamily({
  versions: [context.version({ modules: [operations], compatibility })],
  upgradeManifest: { documentType: "test/inference", latestVersion: 1, supportedVersions: [1], upgrades: {} },
});
const familyArchived: "ARCHIVE_V1" = family.at(1).actions.archive().type;
declare const dynamic: SchemaFirstSpecificationCompatibility;
const unknown = context.finalize({ modules: [operations], compatibility: dynamic });
const unknownType: string = unknown.actions.archive().type;
// @ts-expect-error a runtime compatibility map can choose another action type
const wrong: "ARCHIVE" = unknown.actions.archive().type;
const dynamicModule = context.module("operations" as string, {
  operations: ({ global }) => ({ archive: global({ input: ph.input({ fields: {} }), reduce() {} }) }),
});
const possibleOverride = context.finalize({ modules: [dynamicModule], compatibility });
const possibleType: "ARCHIVE" | "ARCHIVE_V1" = possibleOverride.actions.archive().type;
// @ts-expect-error a runtime module name may select the compatibility override
const wrongModuleType: "ARCHIVE" = possibleOverride.actions.archive().type;
const empty = context.finalize({ modules: [] });
const noop: "NOOP" = empty.actions.noop().type;
`);
    expect(result.diagnostics).toEqual([]);
  });

  it("infers scalar validators and distinguishes stored input from parsed output", () => {
    const result = emitDeclaration(`
import { z } from "zod";
import { ph } from "../../src/definition/field.js";
import { defineScalar } from "../../src/definition/scalars/define-scalar.js";
import type { InputOf, OutputOf, SourceOf } from "../../src/definition/types.js";
const ref = ph.AttachmentRef({ required: true });
declare const attachment: OutputOf<typeof ref>;
const typedRef: \`attachment://v\${number}:\${string}\` = attachment;
const address = ph.Address({ required: true });
declare const account: OutputOf<typeof address>;
const typedAddress: \`\${string}:0x\${string}\` = account;
const Point = defineScalar({ name: "Point", description: "A point", representation: "json-object", validator: z.object({ x: z.number(), y: z.number() }), zodSource: "point" });
const point = Point({ required: true });
declare const input: InputOf<typeof point>;
const x: number = input.x;
const NumericText = defineScalar({ name: "NumericText", description: "Numeric text", representation: "string", validator: z.string().transform(Number), zodSource: "numericText" });
const transformed = NumericText({ required: true });
const raw: InputOf<typeof transformed> = "4";
const stored: SourceOf<typeof transformed> = "4";
const parsed: OutputOf<typeof transformed> = 4;
// @ts-expect-error creators and reducers preserve the validated raw input
const wrongRaw: InputOf<typeof transformed> = 4;
const strictValidator = z.custom<\`ref:\${string}\`>();
const Strict = defineScalar({
  name: "Strict", description: "Strict reference", representation: "string",
  validator: strictValidator, zodSource: "strictValidator",
  // @ts-expect-error an explicit coercion cannot widen the validator's output
  coercion: { parseValue: () => "loose", parseLiteral: () => "loose", serialize: (value) => value },
});
const amount = ph.AmountFiat({ required: true });
declare const money: InputOf<typeof amount>;
const unit: string = money.unit;
const value: number = money.value;
`);
    expect(result.diagnostics).toEqual([]);
  });

  it("retains raw transformed scalar values in creators, reducers, and state", () => {
    const NumericText = defineScalar({
      name: "NumericText",
      description: "Numeric text",
      representation: "string",
      validator: z.string().transform(Number),
      zodSource: "z.string().transform(Number)",
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
            fields: { value: NumericText({ required: true }) },
          }),
          initialValue: { value: "1" },
        },
        local: { schema: null, initialValue: {} },
      },
    });
    const operations = context.module("values", {
      operations: ({ global }) => ({
        setValue: global({
          input: ph.input({
            fields: { value: NumericText({ required: true }) },
          }),
          reduce(state, input) {
            state.value = input.value;
          },
        }),
      }),
    });
    const model = context.finalize({ modules: [operations] });
    const action = model.actions.setValue({ value: "4" });
    expect(action.input.value).toBe("4");
    expect(
      model.reducer(model.utils.createDocument(), action).state.global.value,
    ).toBe("4");
    expect(NumericText.binding.coercion.parseValue("4")).toBe(4);
  });
});
