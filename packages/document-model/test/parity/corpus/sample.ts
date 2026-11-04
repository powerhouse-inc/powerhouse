import {
  defineDocumentModel,
  materialize,
  ph,
} from "../../../src/definition/index.js";

const SampleState = ph.object("SampleState", {
  fields: {
    label: ph.OLabel(),
    entries: ph.list(ph.String({ required: true }), { required: true }),
  },
});

const context = defineDocumentModel({
  id: "test/sample",
  name: "Sample",
  description: "A model with examples.",
  extension: "sample",
  version: 1,
  author: { name: "Powerhouse", website: null },
  scopes: {
    global: {
      schema: SampleState,
      examples: [
        {
          key: "one-entry",
          value: '{"entries":["one"]}',
        },
      ],
      initialValue: { label: null, entries: [] },
    },
    local: { schema: null, initialValue: {} },
  },
});

const entries = context.module("entries", {
  description: "",
  operations: ({ global }) => ({
    addEntry: global({
      description: "",
      input: ph.input({
        fields: {
          entry: ph.String({ required: true }),
          at: ph.DateTime(),
        },
      }),
      errors: {
        EntryTooLong: {
          code: "ENTRY_TOO_LONG",
          name: "EntryTooLong",
          description: "The entry exceeds the limit.",
          template: null,
        },
      },
      examples: [
        {
          key: "add-one",
          value: '{"entry":"one"}',
        },
      ],
      template: "",
      reducerTemplate: "",
      reduce() {},
    }),
  }),
});

export const sample = materialize(context.version({ modules: [entries] }));
