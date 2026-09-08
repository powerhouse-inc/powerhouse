import { defineDocumentModel, ph } from "document-model";

const counter = defineDocumentModel({
  id: "powerhouse/cf-build-control",
  name: "Build Control",
  description: "B9 build-order control model.",
  extension: "ph-b9-control",
  version: 1,
  author: { name: "Powerhouse" },
  specifications: {
    global: {
      schema: ph.object("BuildControlState", {
        fields: { value: ph.Int({ required: true }) },
      }),
      initialValue: { value: 0 },
    },
    local: { schema: null, initialValue: {} },
  },
});

const operations = counter.module("counter", {
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

export const CounterV1 = counter.finalize({ modules: [operations] });
