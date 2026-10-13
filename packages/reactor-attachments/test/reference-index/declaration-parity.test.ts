import type { AttachmentRef } from "@powerhousedao/reactor";
import type { Action } from "@powerhousedao/shared/document-model";
import {
  defineDocumentModel,
  ph,
  schemaFirstSpecification,
  type AnyTypeDescriptor,
} from "document-model";
import { describe, expect, it } from "vitest";
import { AttachmentSchemaCompiler } from "../../index.js";

const REF_A = `attachment://v1:${"a".repeat(64)}` as const;
const REF_B = `attachment://v1:${"b".repeat(64)}` as const;
const REF_C = `attachment://v2:${"c".repeat(64)}` as const;
const ERROR_PREFIX =
  'Attachment extraction failed for document type "example/declaration-parity", version 1, action "ATTACH_FILES" at ';

function codeFirstModule() {
  const node = ph.input("AttachmentNodeInput", {
    fields: {
      ref: ph.AttachmentRef(),
      next: ph.ref((): AnyTypeDescriptor => node),
    },
  });
  const model = defineDocumentModel({
    id: "example/declaration-parity",
    name: "DeclarationParity",
    description: "",
    extension: "parity",
    version: 1,
    author: { name: "Powerhouse" },
    specifications: {
      global: {
        schema: ph.object("DeclarationParityState", {
          fields: { count: ph.Int({ required: true }) },
        }),
        initialValue: { count: 0 },
      },
      local: { schema: null, initialValue: {} },
    },
  });
  const attachments = model.module("attachments", {
    operations: ({ global }) => ({
      attachFiles: global({
        input: ph.input({
          fields: {
            primary: ph.AttachmentRef({ required: true }),
            optional: ph.AttachmentRef(),
            refs: ph.list(ph.AttachmentRef({ required: true })),
            nested: ph.ref(node),
            fallback: ph.AttachmentRef({
              required: true,
              defaultValue: REF_C,
            }),
            lookalike: ph.String(),
          },
        }),
        reduce(state) {
          state.count += 1;
        },
      }),
    }),
  });
  return model.finalize({
    modules: [attachments],
    compatibility: schemaFirstSpecification({
      names: {
        "operation/attachments/attachFiles": { storedName: "ATTACH_FILES" },
      },
    }),
  });
}

type Outcome = { refs: AttachmentRef[] } | { error: string };

function extract(
  compiler: AttachmentSchemaCompiler,
  module: Parameters<AttachmentSchemaCompiler["forModuleAction"]>[0],
  input: unknown,
): Outcome {
  const action: Action = {
    id: "parity-action",
    type: "ATTACH_FILES",
    input,
    scope: "global",
    timestampUtcMs: "2026-10-12T00:00:00.000Z",
  };
  try {
    return {
      refs: compiler.forModuleAction(module, action.type).extract(action),
    };
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    return { error: error.message };
  }
}

const cases = [
  {
    name: "direct refs",
    input: { primary: REF_A },
    expected: { refs: [REF_A] },
  },
  {
    name: "nullable refs",
    input: { primary: REF_A, optional: null },
    expected: { refs: [REF_A] },
  },
  {
    name: "optional refs",
    input: { primary: REF_A, optional: REF_B },
    expected: { refs: [REF_A, REF_B] },
  },
  {
    name: "ordered lists and duplicates",
    input: { primary: REF_A, refs: [REF_B, REF_A, REF_C] },
    expected: { refs: [REF_A, REF_B, REF_C] },
  },
  {
    name: "recursive nested refs",
    input: { primary: REF_A, nested: { ref: REF_B, next: { ref: REF_C } } },
    expected: { refs: [REF_A, REF_B, REF_C] },
  },
  {
    name: "explicit defaulted fields",
    input: { primary: REF_A, fallback: REF_C },
    expected: { refs: [REF_A, REF_C] },
  },
  {
    name: "String lookalikes",
    input: { primary: REF_A, lookalike: REF_B },
    expected: { refs: [REF_A] },
  },
  {
    name: "malformed refs",
    input: { primary: "not-a-ref" },
    expected: {
      error: `${ERROR_PREFIX}input.primary: the AttachmentRef is malformed`,
    },
  },
  {
    name: "missing required refs",
    input: {},
    expected: {
      error: `${ERROR_PREFIX}input.primary: a required value is missing or null`,
    },
  },
  {
    name: "null required refs",
    input: { primary: null },
    expected: {
      error: `${ERROR_PREFIX}input.primary: a required value is missing or null`,
    },
  },
  {
    name: "invalid lists",
    input: { primary: REF_A, refs: REF_B },
    expected: { error: `${ERROR_PREFIX}input.refs: expected a list` },
  },
  {
    name: "invalid nested objects",
    input: { primary: REF_A, nested: REF_B },
    expected: {
      error: `${ERROR_PREFIX}input.nested: expected an input object`,
    },
  },
  {
    name: "null defaulted fields",
    input: { primary: REF_A, fallback: null },
    expected: {
      error: `${ERROR_PREFIX}input.fallback: a required value is missing or null`,
    },
  },
] satisfies { name: string; input: unknown; expected: Outcome }[];

describe("schema-first and code-first attachment extraction parity", () => {
  const codeFirst = codeFirstModule();
  const { definition: _definition, ...schemaFirst } = codeFirst;

  it.each(cases)("preserves $name", ({ input, expected }) => {
    const compiler = new AttachmentSchemaCompiler();
    expect(extract(compiler, schemaFirst, input)).toEqual(expected);
    expect(extract(compiler, codeFirst, input)).toEqual(expected);
  });

  it("preserves cached extractor behavior for both declarations", () => {
    const compiler = new AttachmentSchemaCompiler();
    for (const module of [schemaFirst, codeFirst]) {
      const first = compiler.forModuleAction(module, "ATTACH_FILES");
      expect(compiler.forModuleAction(module, "ATTACH_FILES")).toBe(first);
      expect(extract(compiler, module, { primary: REF_B })).toEqual({
        refs: [REF_B],
      });
    }
  });
});
