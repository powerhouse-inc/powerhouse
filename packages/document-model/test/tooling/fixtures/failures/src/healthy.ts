import { defineDocumentModel, ph } from "document-model";

/** A valid root beside the failing ones: its report must survive theirs. */

const context = defineDocumentModel({
  id: "test/healthy",
  name: "Healthy",
  description: "A model that compiles.",
  extension: "healthy",
  version: 1,
  author: { name: "Powerhouse", website: null },
  specifications: {
    global: {
      schema: ph.object("HealthyState", {
        fields: { value: ph.String({ required: true }) },
      }),
      initialValue: { value: "" },
    },
    local: { schema: null, initialValue: {} },
  },
});

const values = context.module("values", {
  operations: ({ global }) => ({
    setValue: global({
      input: ph.input({ fields: { value: ph.String({ required: true }) } }),
      reduce(state, input) {
        state.value = input.value;
      },
    }),
  }),
});

export const healthy = context.finalize({ modules: [values] });
