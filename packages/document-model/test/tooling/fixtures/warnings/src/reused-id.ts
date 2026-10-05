import {
  defineDocumentModel,
  ph,
  schemaFirstSpecification,
} from "document-model";

/**
 * An installed model that stored one ID for two operations. Real data does
 * this — `document-drive` stores one ID for two of its actions — so the
 * compiler reports it and keeps going. This fixture is what a warning-only
 * package looks like.
 */

const context = defineDocumentModel({
  id: "test/reused",
  name: "Reused",
  description: "A model whose installed IDs repeat.",
  extension: "reused",
  version: 1,
  author: { name: "Powerhouse", website: null },
  specifications: {
    global: {
      schema: ph.object("ReusedState", {
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
    clearValue: global({
      input: ph.input({ fields: {} }),
      reduce(state) {
        state.value = "";
      },
    }),
  }),
});

export const reused = context.finalize({
  modules: [values],
  compatibility: schemaFirstSpecification({
    ids: {
      "module/values": "0000000000000000000000000000",
      "operation/values/setValue": "AAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      "operation/values/clearValue": "AAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    },
  }),
});
