import { defineDocumentModel, materialize, ph } from "document-model";

const ledger = defineDocumentModel({
  id: "test/ledger",
  name: "Ledger",
  description: "A running total.",
  extension: "ledger",
  version: 1,
  author: { name: "Powerhouse", website: "https://powerhouse.inc" },
  scopes: {
    global: {
      schema: ph.object("LedgerState", {
        fields: {
          title: ph.String({ required: true }),
          total: ph.Int({ required: true }),
        },
      }),
      initialValue: { title: "", total: 0 },
    },
    local: {
      schema: ph.object("LedgerLocalState", {
        fields: { note: ph.String() },
      }),
      initialValue: { note: null },
    },
  },
});

const entries = ledger.module("entries", {
  operations: ({ global, local }) => ({
    setTitle: global({
      input: ph.input({ fields: { title: ph.String({ required: true }) } }),
      reduce(state, input) {
        state.title = input.title;
      },
    }),
    addAmount: global({
      input: ph.input({ fields: { amount: ph.Int({ required: true }) } }),
      errors: {
        NegativeAmount: {
          code: "NEGATIVE_AMOUNT",
          description: "Amounts are added, never subtracted.",
        },
      },
      reduce(state, input, ctx) {
        if (input.amount < 0) throw new ctx.errors.NegativeAmount();
        state.total += input.amount;
      },
    }),
    setNote: local({
      input: ph.input({ fields: { note: ph.String() } }),
      reduce(state, input) {
        state.note = input.note ?? null;
      },
    }),
  }),
});

export const Ledger = materialize(ledger.version({ modules: [entries] }));
