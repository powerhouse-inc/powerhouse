import { defineDocumentModel, materialize, ph } from "document-model";

const model = defineDocumentModel({
  id: "test/healthy",
  name: "Healthy",
  description: "A model that compiles.",
  extension: "healthy",
  version: 1,
  author: { name: "Powerhouse", website: null },
  scopes: {
    global: {
      schema: ph.object("HealthyState", {
        fields: { value: ph.String({ required: true }) },
      }),
      initialValue: { value: "" },
    },
    local: { schema: null, initialValue: {} },
  },
});

const values = model.module("values", {
  operations: ({ global }) => ({
    setValue: global({
      input: ph.input({ fields: { value: ph.String({ required: true }) } }),
      reduce(state, input) {
        state.value = input.value;
      },
    }),
  }),
});

export const healthy = materialize(model.version({ modules: [values] }));
