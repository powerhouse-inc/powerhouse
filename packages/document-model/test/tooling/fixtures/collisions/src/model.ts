import { defineDocumentModel, materialize, ph } from "document-model";

export function buildLedger() {
  const model = defineDocumentModel({
    id: "test/ledger",
    name: "Ledger",
    description: "A ledger.",
    extension: "ledger",
    version: 1,
    author: { name: "Powerhouse", website: null },
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
  const entries = model.module("entries", {
    operations: ({ global }) => ({
      addAmount: global({
        input: ph.input({ fields: { amount: ph.Int({ required: true }) } }),
        reduce(state, input) {
          state.total += input.amount;
        },
      }),
    }),
  });
  return materialize(model.version({ modules: [entries] }));
}
