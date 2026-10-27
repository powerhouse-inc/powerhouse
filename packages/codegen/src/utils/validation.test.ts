import type { DocumentModelGlobalState } from "@powerhousedao/shared/document-model";
import {
  addModule,
  addOperation,
  documentModelCreateDocument,
  documentModelReducer,
  setInitialState,
  setModelExtension,
  setModelId,
  setModelName,
  setStateSchema,
} from "document-model";
import { describe, expect, it } from "vitest";
import { validateDocumentModelState } from "./validation.js";

/** A "Reading List" model, built with the actions an agent sends. */
function readingList(globalType: string, localType?: string) {
  const actions = [
    setModelName({ name: "Reading List" }),
    setModelId({ id: "acme/reading-list" }),
    setModelExtension({ extension: "rl" }),
    setStateSchema({
      scope: "global",
      schema: `type ${globalType} { books: [String!]! }`,
    }),
    setInitialState({ scope: "global", initialValue: '{"books":[]}' }),
    ...(localType
      ? [
          setStateSchema({
            scope: "local",
            schema: `type ${localType} { filter: String }`,
          }),
          setInitialState({ scope: "local", initialValue: '{"filter":null}' }),
        ]
      : []),
    addModule({ id: "books", name: "books" }),
    addOperation({ id: "add-book", moduleId: "books", name: "ADD_BOOK" }),
  ];
  const document = actions.reduce(
    (doc, action) => documentModelReducer(doc, action),
    documentModelCreateDocument(),
  );
  return document.state.global as DocumentModelGlobalState;
}

describe("validateDocumentModelState", () => {
  it("accepts state types named after the model", () => {
    const result = validateDocumentModelState(
      readingList("ReadingListState", "ReadingListLocalState"),
    );

    expect(result).toEqual({ isValid: true, errors: [] });
  });

  it("refuses a global state type codegen would not find", () => {
    const result = validateDocumentModelState(readingList("BookListState"));

    expect(result.isValid).toBe(false);
    expect(result.errors).toEqual([
      'Global state schema must define `type ReadingListState`: codegen names the global state of model "Reading List" ReadingListState, but the schema defines BookListState. Rename the type in SET_STATE_SCHEMA, or rename the model.',
    ]);
  });

  it("refuses a local state type not named <Model>LocalState", () => {
    const result = validateDocumentModelState(
      readingList("ReadingListState", "LocalState"),
    );

    expect(result.errors).toEqual([
      expect.stringContaining(
        "Local state schema must define `type ReadingListLocalState`",
      ),
    ]);
  });
});
