import { defineDocumentModel, ph } from "document-model";

const Named = ph.interface("Named", {
  fields: { label: ph.String({ required: true }) },
});

export const missing = defineDocumentModel({
  id: "test/missing",
  name: "Missing",
  description: "",
  extension: "missing",
  version: 1,
  author: { name: "Powerhouse" },
  specifications: {
    global: {
      schema: ph.object("MissingState", {
        implements: [Named],
        fields: { other: ph.String() },
      }),
      initialValue: { other: null },
    },
    local: { schema: null, initialValue: {} },
  },
}).finalize({ modules: [] });
