import type {
  DocumentModelGlobalState,
  DocumentSpecification,
} from "@powerhousedao/shared/document-model";
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
import {
  assertNoReservedOperationNames,
  validateDocumentModelState,
} from "./validation.js";

function specification(
  version: number,
  operationNames: string[],
): DocumentSpecification {
  return {
    version,
    changeLog: [],
    state: {
      global: { schema: "", initialValue: "", examples: [] },
      local: { schema: "", initialValue: "", examples: [] },
    },
    modules: [
      {
        id: "module-1",
        name: "items",
        description: null,
        operations: operationNames.map((name, index) => ({
          id: `operation-${index}`,
          name,
          description: null,
          errors: [],
          examples: [],
          reducer: null,
          schema: null,
          template: null,
          scope: "global",
        })),
      },
    ],
  };
}

function documentModelState(
  ...specifications: DocumentSpecification[]
): DocumentModelGlobalState {
  return {
    id: "powerhouse/test",
    name: "Test",
    extension: "",
    description: "",
    author: { name: "", website: null },
    specifications,
  };
}

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
  it("accepts a spec without reserved operation names", () => {
    expect(
      validateDocumentModelState(
        documentModelState(specification(1, ["ADD_ITEM"])),
      ),
    ).toEqual({ isValid: true, errors: [] });
  });

  it.each([
    "RETRACT",
    "UNDO",
    "retract",
    "setName",
    "purgeDocument",
    "retract ",
    "set-preferred-editor",
  ])("refuses an operation named %s", (name) => {
    const result = validateDocumentModelState(
      documentModelState(specification(1, ["ADD_ITEM", name])),
    );
    expect(result.isValid).toBe(false);
    expect(result.errors).toEqual([
      `Operation "${name}" in module "items" has a reserved name`,
    ]);
  });
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

describe("assertNoReservedOperationNames", () => {
  it("passes a model without reserved operation names", () => {
    expect(() =>
      assertNoReservedOperationNames(
        documentModelState(specification(1, ["ADD_ITEM"])),
      ),
    ).not.toThrow();
  });

  it("refuses a reserved name in any specification", () => {
    expect(() =>
      assertNoReservedOperationNames(
        documentModelState(
          specification(1, ["RETRACT"]),
          specification(2, ["ADD_ITEM"]),
        ),
      ),
    ).toThrow(
      'Cannot generate document model "Test": Operation "RETRACT" in module "items" has a reserved name (specification v1)',
    );
  });
});
