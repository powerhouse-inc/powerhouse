import { defineDocumentModel, materialize, ph } from "document-model";

const model = defineDocumentModel({
  id: "test/duplicate",
  name: "Duplicate",
  description: "A model with two modules named alike.",
  extension: "duplicate",
  version: 1,
  author: { name: "Powerhouse", website: null },
  scopes: {
    global: {
      schema: ph.object("DuplicateState", {
        fields: { value: ph.String({ required: true }) },
      }),
      initialValue: { value: "" },
    },
    local: { schema: null, initialValue: {} },
  },
});

const first = model.module("shared", { operations: () => ({}) });
const second = model.module("shared", { operations: () => ({}) });

export const duplicate = materialize(
  model.version({ modules: [first, second] }),
);
