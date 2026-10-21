import {
  defineDocumentModel,
  ph,
  schemaFirstSpecification,
} from "document-model";

/** The healthy module every forgery in this package is built from. */

export function buildContext() {
  return defineDocumentModel({
    id: "test/forged",
    name: "Forged",
    description: "A model to tamper with.",
    extension: "forged",
    version: 1,
    author: { name: "Powerhouse", website: null },
    specifications: {
      global: {
        schema: ph.object("ForgedState", {
          fields: { value: ph.String({ required: true }) },
        }),
        initialValue: { value: "" },
      },
      local: { schema: null, initialValue: {} },
    },
  });
}

export function buildModule(context: ReturnType<typeof buildContext>) {
  return context.module("values", {
    operations: ({ global }) => ({
      setValue: global({
        input: ph.input({ fields: { value: ph.String({ required: true }) } }),
        reduce(state, input) {
          state.value = input.value;
        },
      }),
    }),
  });
}

export function buildForged() {
  const context = buildContext();
  return context.finalize({ modules: [buildModule(context)] });
}

/** A declaration whose retained global schema describes a different structure. */
export function buildRetainedMismatch() {
  const context = buildContext();
  return context.finalize({
    modules: [buildModule(context)],
    compatibility: schemaFirstSpecification({
      serialization: {
        "state/global/schema": "type ForgedState {\n  value: Int!\n}\n",
      },
    }),
  });
}
