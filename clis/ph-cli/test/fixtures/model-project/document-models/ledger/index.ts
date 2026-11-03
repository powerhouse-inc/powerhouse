import { defineDocumentModel, materialize, ph } from "document-model";
import { Iban } from "../../scalars/index.js";

const model = defineDocumentModel({
  id: "example/ledger",
  name: "Ledger",
  description: "A ledger.",
  extension: ".ledger",
  version: 1,
  author: { name: "Fixture", website: null },
  scopes: {
    global: {
      schema: ph.object("LedgerState", {
        fields: {
          total: ph.Int({ required: true }),
          currency: ph.Currency(),
          iban: ph.scalar(Iban),
        },
      }),
      initialValue: { total: 0, currency: null, iban: null },
    },
    local: { schema: null, initialValue: {} },
  },
});

const entries = model.module("entries", {
  operations: ({ global }) => ({
    addAmount: global({
      input: ph.input("AddAmountInput", {
        fields: { amount: ph.Int({ required: true }) },
      }),
      errors: { Overdrawn: { code: "OVERDRAWN" } },
      reduce(state, input) {
        state.total += input.amount;
      },
    }),
  }),
});

export const Ledger = materialize(model.version({ modules: [entries] }));
