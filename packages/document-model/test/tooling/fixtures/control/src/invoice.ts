import {
  defineDocumentModel,
  defineDocumentModelFamily,
  ph,
} from "document-model";
import { normalizeTitle } from "./helper.js";

/** The control fixture: one healthy two-version family and nothing else. */

const author = { name: "Powerhouse", website: "https://powerhouse.inc" };

const invoiceV1Context = defineDocumentModel({
  id: "test/invoice",
  name: "Invoice",
  description: "An invoice.",
  extension: "invoice",
  version: 1,
  author,
  specifications: {
    global: {
      schema: ph.object("InvoiceState", {
        fields: { title: ph.String({ required: true }) },
      }),
      initialValue: { title: "" },
    },
    local: { schema: null, initialValue: {} },
  },
});

const invoiceV2Context = defineDocumentModel({
  id: "test/invoice",
  name: "Invoice",
  description: "An invoice.",
  extension: "invoice",
  version: 2,
  author,
  specifications: {
    global: {
      schema: ph.object("InvoiceState", {
        fields: {
          title: ph.String({ required: true }),
          note: ph.String(),
        },
      }),
      initialValue: { title: "", note: null },
    },
    local: { schema: null, initialValue: {} },
  },
});

const titleInput = { fields: { title: ph.String({ required: true }) } };

const v1Header = invoiceV1Context.module("header", {
  operations: ({ global }) => ({
    setTitle: global({
      input: ph.input(titleInput),
      reduce(state, input) {
        state.title = normalizeTitle(input.title);
      },
    }),
  }),
});

const v2Header = invoiceV2Context.module("header", {
  operations: ({ global }) => ({
    setTitle: global({
      input: ph.input(titleInput),
      reduce(state, input) {
        state.title = normalizeTitle(input.title);
      },
    }),
  }),
});

export const invoiceFamily = defineDocumentModelFamily({
  versions: [
    invoiceV1Context.version({ modules: [v1Header] }),
    invoiceV2Context.version({ modules: [v2Header] }),
  ],
  upgradeManifest: {
    documentType: "test/invoice",
    latestVersion: 2,
    supportedVersions: [1, 2],
    upgrades: {
      v2: {
        toVersion: 2,
        description: "",
        upgradeReducer(document) {
          const typed = document as unknown as {
            state: { global: Record<string, unknown> };
            initialState: { global: Record<string, unknown> };
          };
          return {
            ...typed,
            state: {
              ...typed.state,
              global: { ...typed.state.global, note: null },
            },
            initialState: {
              ...typed.initialState,
              global: { ...typed.initialState.global, note: null },
            },
          } as never;
        },
      },
    },
  },
});

export const invoiceV1 = invoiceFamily.at(1);
