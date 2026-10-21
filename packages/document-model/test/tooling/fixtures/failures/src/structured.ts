import { defineDocumentModel, ph } from "document-model";

/**
 * A declaration that fails compilation with more than one diagnostic at once:
 * neither state root carries the name derived from the model name. Both are
 * collected and thrown together, so this root is what proves the loader
 * carries every original code, path, and repair across the import boundary
 * instead of flattening them into one "import failed".
 */

const context = defineDocumentModel({
  id: "test/structured",
  name: "Structured",
  description: "A model that does not compile.",
  extension: "structured",
  version: 1,
  author: { name: "Powerhouse", website: null },
  specifications: {
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

export const structured = context.finalize({ modules: [] });
