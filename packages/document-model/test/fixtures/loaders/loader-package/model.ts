import {
  defineDocumentModel,
  defineDocumentModelFamily,
  ph,
} from "document-model";
import type {
  Action,
  DocumentModelModule,
  PHDocument,
} from "@powerhousedao/shared/document-model";

/**
 * The one model every host loader path loads.
 *
 * Two versions of one document type, declared code-first, with the upgrade
 * transition a version gap requires. Two versions rather than one because
 * three of the nine paths differ precisely in how they pick among them: the
 * browser worker keys by `documentType@version` and resolves the latest,
 * Connect keeps the first of a duplicate pair, and the GraphQL manager keeps
 * the latest by specification version.
 */

const author = { name: "Powerhouse", website: "https://powerhouse.inc" };

const v1 = defineDocumentModel({
  id: "test/ledger",
  name: "Ledger",
  description: "A ledger.",
  extension: "ledger",
  version: 1,
  author,
  specifications: {
    global: {
      schema: ph.object("LedgerState", {
        fields: { total: ph.Int({ required: true }) },
      }),
      initialValue: { total: 0 },
    },
    local: { schema: null, initialValue: {} },
  },
});

const entriesV1 = v1.module("entries", {
  operations: ({ global }) => ({
    addAmount: global({
      input: ph.input({ fields: { amount: ph.Int({ required: true }) } }),
      reduce(state, input) {
        state.total += input.amount;
      },
    }),
  }),
});

const v2 = defineDocumentModel({
  id: "test/ledger",
  name: "Ledger",
  description: "A ledger.",
  extension: "ledger",
  version: 2,
  author,
  specifications: {
    global: {
      schema: ph.object("LedgerState", {
        fields: {
          total: ph.Int({ required: true }),
          currency: ph.Currency(),
        },
      }),
      initialValue: { total: 0, currency: null },
    },
    local: { schema: null, initialValue: {} },
  },
});

const entriesV2 = v2.module("entries", {
  operations: ({ global }) => ({
    addAmount: global({
      input: ph.input({ fields: { amount: ph.Int({ required: true }) } }),
      reduce(state, input) {
        state.total += input.amount;
      },
    }),
    setCurrency: global({
      input: ph.input({
        fields: { currency: ph.Currency({ required: true }) },
      }),
      reduce(state, input) {
        state.currency = input.currency;
      },
    }),
  }),
});

/**
 * Compiles the family. Called once per published entry, not shared.
 *
 * A real package's Node build and browser build are separate bundles of one
 * declaration, and a schema-first package is a different package altogether.
 * If every entry re-exported one instance, "the two agree" would be an object
 * compared with itself and no change to either could fail it.
 */
export function buildFamily() {
  return defineDocumentModelFamily({
    versions: [
      v1.version({ modules: [entriesV1] }),
      v2.version({ modules: [entriesV2] }),
    ],
    upgradeManifest: {
      documentType: "test/ledger",
      latestVersion: 2,
      supportedVersions: [1, 2],
      upgrades: {
        v2: {
          toVersion: 2,
          upgradeReducer: (document: PHDocument, _action: Action) => document,
        },
      },
    },
  });
}

/**
 * The same modules with the structured definition removed.
 *
 * That is the whole difference between a code-first package and the
 * schema-first package it replaces: the stored `documentModel`, the reducer,
 * the actions and the utils are identical, so every loader predicate that
 * accepts one has to accept the other.
 */
export function asSchemaFirst(module: unknown): DocumentModelModule {
  const { definition: _definition, ...rest } = module as Record<
    string,
    unknown
  >;
  return rest as unknown as DocumentModelModule;
}
