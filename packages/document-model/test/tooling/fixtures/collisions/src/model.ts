import { defineDocumentModel, ph } from "document-model";

/** One declaration, materialized twice into two distinct module objects. */
export function buildLedger() {
  const context = defineDocumentModel({
    id: "test/ledger",
    name: "Ledger",
    description: "A ledger.",
    extension: "ledger",
    version: 1,
    author: { name: "Powerhouse", website: null },
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
  const entries = context.module("entries", {
    operations: ({ global }) => ({
      addAmount: global({
        input: ph.input({ fields: { amount: ph.Int({ required: true }) } }),
        reduce(state, input) {
          state.total += input.amount;
        },
      }),
    }),
  });
  return context.finalize({ modules: [entries] });
}
