import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import type { ExecutionResult } from "graphql";
import { describe, expect, it } from "vitest";
import {
  asSchemaFirst,
  asStored,
  ledgerModel,
} from "./utils/code-first-models.js";
import {
  hostFor,
  messages,
  recordingAuthorization,
} from "./utils/document-model-host.js";

const READ = `query { Ledger { document(idOrSlug: "doc-1") {
  document { id documentType state { global { title entries { id amount } } local { note } } }
} } }`;

async function bothModels(...requests: string[]) {
  const outcomes = async (module: DocumentModelModule) => {
    const host = hostFor(module);
    const results: ExecutionResult[] = [];
    for (const request of requests) results.push(await host.run(request));
    return results;
  };
  const codeFirst = await outcomes(ledgerModel());
  const schemaFirst = await outcomes(asSchemaFirst(ledgerModel()));
  return { codeFirst, schemaFirst };
}

describe("a code-first model executes as its schema-first twin", () => {
  it("creates, mutates and reads a document", async () => {
    const { codeFirst, schemaFirst } = await bothModels(
      `mutation { Ledger { createEmptyDocument { id documentType } } }`,
      `mutation { Ledger { setTitle(docId: "doc-1", input: { title: "Q3" }) { id } } }`,
      `mutation { Ledger { addEntry(docId: "doc-1", input: { id: "e1", amount: 5 }) { state { global { entries { id amount } } } } } }`,
      `mutation { Ledger { setNoteAsync(docId: "doc-1", input: { note: "hi" }) } }`,
      READ,
      `mutation { Ledger { clear(docId: "doc-1", input: {}) { revisionsList { scope revision } } } }`,
    );

    expect(codeFirst).toEqual(schemaFirst);
    expect(codeFirst.map(messages).flat()).toEqual([]);
    expect(codeFirst[0].data).toEqual({
      Ledger: {
        createEmptyDocument: { id: "doc-1", documentType: "test/ledger" },
      },
    });
    expect(codeFirst[2].data).toEqual({
      Ledger: {
        addEntry: {
          state: { global: { entries: [{ id: "e1", amount: 5 }] } },
        },
      },
    });
    expect(codeFirst[3].data).toEqual({
      Ledger: { setNoteAsync: "job-doc-1" },
    });
    expect(codeFirst[4].data).toEqual({
      Ledger: {
        document: {
          document: {
            id: "doc-1",
            documentType: "test/ledger",
            state: {
              global: { title: "Q3", entries: [{ id: "e1", amount: 5 }] },
              local: { note: "hi" },
            },
          },
        },
      },
    });
    expect(codeFirst[5].data).toEqual({
      Ledger: {
        clear: {
          revisionsList: [
            { scope: "document", revision: 0 },
            { scope: "global", revision: 3 },
            { scope: "local", revision: 1 },
          ],
        },
      },
    });
  });
});

describe("mutation authorization", () => {
  const forbidden =
    'Forbidden: insufficient permissions to execute operation "AddEntry" on this document';
  const twoWrites = [
    `mutation { Ledger { addEntry(docId: "doc-1", input: { id: "a", amount: 1 }) { id } } }`,
    `mutation { Ledger { addEntryAsync(docId: "doc-1", input: { id: "b", amount: 2 }) } }`,
  ];

  async function checkedAs(module: DocumentModelModule, denied?: string) {
    const { authorization, checked } = recordingAuthorization(denied);
    const host = hostFor(module, authorization);
    const results = [];
    for (const request of twoWrites) results.push(await host.run(request));
    return { checked, messages: results.flatMap(messages), host };
  }

  it.each([
    ["code-first", ledgerModel()],
    ["code-first served stored", asStored(ledgerModel())],
  ])(
    "checks a %s mutation against its stored name, as main does",
    async (_name, module) => {
      const outcome = await checkedAs(module, "ADD_ENTRY");
      expect(outcome.checked).toEqual(["AddEntry", "AddEntry"]);
      expect(outcome.messages).toEqual([]);
    },
  );

  it("keeps denying a code-first mutation restricted under its stored name", async () => {
    const outcome = await checkedAs(ledgerModel(), "AddEntry");
    expect(outcome.messages).toEqual([forbidden, forbidden]);
    expect(
      (outcome.host.document().state as { global?: unknown }).global,
    ).toEqual({
      title: null,
      entries: [],
    });
  });
});

describe("mutation failure messages", () => {
  function withoutCreator(module: DocumentModelModule): DocumentModelModule {
    const { addEntry: _addEntry, ...actions } = module.actions;
    return { ...module, actions } as DocumentModelModule;
  }

  it.each([
    ["code-first", ledgerModel(), "Action AddEntry not found"],
    [
      "code-first served stored",
      asStored(ledgerModel()),
      "Action AddEntry not found",
    ],
  ])("names a missing %s action creator", async (_name, module, message) => {
    const host = hostFor(withoutCreator(module));
    const result = await host.run(
      `mutation { Ledger { addEntry(docId: "doc-1", input: { id: "a", amount: 1 }) { id } } }`,
    );
    expect(messages(result)).toEqual([message]);
  });
});
