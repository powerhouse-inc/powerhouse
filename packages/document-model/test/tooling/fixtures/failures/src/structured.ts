import { defineDocumentModel, ph } from "document-model";

export const structured = defineDocumentModel({
  id: "test/structured",
  name: "Structured",
  description: "A model that does not compile.",
  extension: "structured",
  version: 1,
  author: { name: "Powerhouse", website: null },
  scopes: {
    global: {
      schema: ph.object("WrongGlobalRoot", {
        fields: { value: ph.String({ required: true }) },
      }),
      initialValue: { value: "" },
    },
    local: {
      schema: ph.object("WrongLocalRoot", {
        fields: { note: ph.String({ required: true }) },
      }),
      initialValue: { note: "" },
    },
  },
});
