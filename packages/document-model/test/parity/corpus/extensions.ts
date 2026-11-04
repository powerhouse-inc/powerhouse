import {
  defineDocumentModel,
  materialize,
  ph,
} from "../../../src/definition/index.js";

const ExtensionsStatus = ph.enum("ExtensionsStatus", {
  values: ["OPEN", "CLOSED"],
});

const ExtensionsState = ph.object("ExtensionsState", {
  fields: {
    title: ph.String({ required: true }),
    status: ph.ref(ExtensionsStatus, { required: true }),
    note: ph.String(),
    flagged: ph.Boolean(),
  },
});

const context = defineDocumentModel({
  id: "test/extensions",
  name: "Extensions",
  description: "A model whose stored SDL extends its types.",
  extension: "extensions",
  version: 1,
  author: { name: "Powerhouse", website: null },
  scopes: {
    global: {
      schema: ExtensionsState,
      initialValue: { title: "", status: "OPEN", note: null, flagged: null },
    },
    local: { schema: null, initialValue: {} },
  },
});

const statuses = context.module("statuses", {
  description: "",
  operations: ({ global }) => ({
    setStatus: global({
      description: "",
      input: ph.input({
        fields: {
          status: ph.ref(ExtensionsStatus, { required: true }),
          reason: ph.String(),
        },
      }),
      template: "",
      reducerTemplate: "",
      reduce() {},
    }),
  }),
});

export const extensions = materialize(context.version({ modules: [statuses] }));
