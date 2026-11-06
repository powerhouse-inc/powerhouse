import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import { defineDocumentModel, materialize, ph } from "document-model";
import { expect, it } from "vitest";
import { asSchemaFirst, ledgerModel } from "./utils/code-first-models.js";
import {
  hostFor,
  messages,
  recordingAuthorization,
} from "./utils/document-model-host.js";

function convertedLedger(): DocumentModelModule {
  const Entry = ph.object("LedgerEntry", {
    fields: {
      id: ph.ID({ required: true }),
      amount: ph.Int({ required: true }),
    },
  });
  const ledger = defineDocumentModel({
    id: "test/ledger",
    name: "Ledger",
    description: "A ledger.",
    extension: "ledger",
    version: 1,
    author: { name: "Powerhouse" },
    scopes: {
      global: {
        schema: ph.object("LedgerState", {
          fields: {
            title: ph.String(),
            entries: ph.list(ph.ref(Entry, { required: true }), {
              required: true,
            }),
          },
        }),
        initialValue: { title: null, entries: [] },
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
    operations: ({ global }) => ({
      addEntry: global({
        name: "ADD_ENTRY",
        input: ph.input({
          fields: {
            id: ph.ID({ required: true }),
            amount: ph.Int({ required: true }),
          },
        }),
        reduce(state, input) {
          state.entries.push({ id: input.id, amount: input.amount });
        },
      }),
      setTitle: global({
        name: "SET_TITLE",
        input: ph.input({ fields: { title: ph.String() } }),
        reduce(state, input) {
          state.title = input.title ?? null;
        },
      }),
    }),
  });
  return materialize(
    ledger.version({ modules: [entries] }),
  ) as unknown as DocumentModelModule;
}

it("authorizes a converted model's mutations by the key its schema-first original used", async () => {
  const addEntry = `mutation { Ledger { addEntry(docId:"doc-1", input:{id:"a",amount:1}) { id } } }`;
  const setTitle = `mutation { Ledger { setTitle(docId:"doc-1", input:{title:"t"}) { id } } }`;
  const outcomes = [];
  for (const model of [asSchemaFirst(ledgerModel()), convertedLedger()]) {
    const { authorization, checked } = recordingAuthorization("ADD_ENTRY");
    const host = hostFor(model, authorization);
    const refused = messages(await host.run(addEntry)).length;
    const allowed = messages(await host.run(setTitle)).length;
    outcomes.push({ checked, refused, allowed });
  }
  expect(outcomes).toStrictEqual([
    { checked: ["ADD_ENTRY", "SET_TITLE"], refused: 1, allowed: 0 },
    { checked: ["ADD_ENTRY", "SET_TITLE"], refused: 1, allowed: 0 },
  ]);
});
