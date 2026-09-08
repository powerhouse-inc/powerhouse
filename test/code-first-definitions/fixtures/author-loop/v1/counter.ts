import { defineDocumentModel, ph } from "document-model";

const counter = defineDocumentModel({
  id: "powerhouse/cf-counter",
  name: "Code First Counter",
  description: "A generated-file-free author-loop fixture.",
  extension: "phcf-counter",
  version: 1,
  author: { name: "Powerhouse" },
  specifications: {
    global: {
      schema: ph.object("CodeFirstCounterState", {
        fields: { value: ph.Int({ required: true }) },
      }),
      initialValue: { value: 0 },
    },
    local: { schema: null, initialValue: {} },
  },
});

const counterOperations = counter.module("counter", {
  operations: ({ global }) => ({
    setValue: global({
      input: ph.input({
        fields: { value: ph.Int({ required: true }) },
      }),
      reduce(state, input) {
        state.value = input.value;
      },
    }),
  }),
});

export const CounterV1 = counter.finalize({
  modules: [counterOperations],
});
