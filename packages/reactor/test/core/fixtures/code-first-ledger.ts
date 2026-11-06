import type { UpgradeManifest } from "@powerhousedao/shared/document-model";
import {
  defineDocumentModel,
  defineDocumentModelFamily,
  materialize,
  ph,
} from "document-model";

const config = {
  id: "test/ledger",
  name: "Ledger",
  description: "Amounts in one currency.",
  extension: "ledger",
  author: { name: "Powerhouse", website: "https://powerhouse.inc" },
};

const v1 = defineDocumentModel({
  ...config,
  version: 1,
  scopes: {
    global: {
      schema: ph.object("LedgerState", {
        fields: { total: ph.Int({ required: true }) },
      }),
      initialValue: { total: 0 },
    },
    local: { schema: null, initialValue: {} },
  },
});

const v2 = defineDocumentModel({
  ...config,
  version: 2,
  scopes: {
    global: {
      schema: ph.object("LedgerState", {
        fields: {
          total: ph.Int({ required: true }),
          currency: ph.String({ required: true }),
        },
      }),
      initialValue: { total: 0, currency: "USD" },
    },
    local: { schema: null, initialValue: {} },
  },
});

const addAmount = { amount: ph.Int({ required: true }) };

const supportedVersions = [1, 2] as const;

export const upgradeManifest: UpgradeManifest<typeof supportedVersions> = {
  documentType: config.id,
  latestVersion: 2,
  supportedVersions,
  upgrades: {
    v2: {
      toVersion: 2,
      upgradeReducer: (document) => {
        const withCurrency = <T extends { global: object }>(state: T) => ({
          ...state,
          global: { ...state.global, currency: "USD" },
        });
        return {
          ...document,
          state: withCurrency(document.state as { global: object }),
          initialState: withCurrency(
            document.initialState as { global: object },
          ),
        } as typeof document;
      },
      description: "",
    },
  },
};

const family = materialize(
  defineDocumentModelFamily({
    versions: [
      v1.version({
        modules: [
          v1.module("amounts", {
            operations: ({ global }) => ({
              addAmount: global({
                input: ph.input({ fields: addAmount }),
                reduce(state, input) {
                  state.total += input.amount;
                },
              }),
            }),
          }),
        ],
      }),
      v2.version({
        modules: [
          v2.module("amounts", {
            operations: ({ global }) => ({
              addAmount: global({
                input: ph.input({ fields: addAmount }),
                reduce(state, input) {
                  state.total += input.amount;
                },
              }),
              setCurrency: global({
                input: ph.input({
                  fields: { currency: ph.String({ required: true }) },
                }),
                reduce(state, input) {
                  state.currency = input.currency;
                },
              }),
            }),
          }),
        ],
      }),
    ],
    upgradeManifest,
  }),
);

export const ledgerV1 = family.at(1);
export const ledgerV2 = family.at(2);
