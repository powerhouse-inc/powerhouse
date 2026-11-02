import {
  defineDocumentModel,
  defineDocumentModelFamily,
  materialize,
  ph,
} from "document-model";
import { normalizeTitle } from "./helper.js";

const author = { name: "Powerhouse", website: "https://powerhouse.inc" };

function invoiceModel(version: 1 | 2) {
  return defineDocumentModel({
    id: "test/invoice",
    name: "Invoice",
    description: "An invoice.",
    extension: "invoice",
    version,
    author,
    scopes: {
      global: {
        schema: ph.object("InvoiceState", {
          fields: { title: ph.String({ required: true }) },
        }),
        initialValue: { title: "" },
      },
      local: { schema: null, initialValue: {} },
    },
  });
}

function invoiceVersion(version: 1 | 2) {
  const model = invoiceModel(version);
  const header = model.module("header", {
    operations: ({ global }) => ({
      setTitle: global({
        input: ph.input({ fields: { title: ph.String({ required: true }) } }),
        reduce(state, input) {
          state.title = normalizeTitle(input.title);
        },
      }),
    }),
  });
  return model.version({ modules: [header] });
}

export const invoiceFamily = materialize(
  defineDocumentModelFamily({
    versions: [invoiceVersion(1), invoiceVersion(2)],
    upgradeManifest: {
      documentType: "test/invoice",
      latestVersion: 2,
      supportedVersions: [1, 2],
      upgrades: {
        v2: { toVersion: 2, upgradeReducer: (document) => document },
      },
    },
  }),
);

export const invoiceV1 = invoiceFamily.at(1);
