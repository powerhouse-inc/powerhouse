import { describe, expect, it } from "vitest";
import { createAction } from "./actions.js";
import { baseCreateDocument } from "./documents.js";
import { operationOutcome } from "./operations.js";
import { createReducer } from "./reducer.js";
import { defaultBaseState, type PHBaseState } from "./state.js";
import type { StateReducer } from "./types.js";

type ListState = PHBaseState & { global: { books: string[] }; local: object };

// As codegen generates them: no `name`, the code as a field.
class BookNotStartedError extends Error {
  errorCode = "BOOK_NOT_STARTED";
  constructor(message = "BookNotStartedError") {
    super(message);
  }
}

const stateReducer: StateReducer<ListState> = (_state, action) => {
  if (action.type === "FINISH_BOOK") {
    throw new BookNotStartedError("Dune has not been started");
  }
  if (action.type === "RETURN_BOOK") {
    // oxlint-disable-next-line typescript/only-throw-error -- a reducer can throw a value that is not an Error
    throw Object.assign(Object.create(null) as object, {
      name: "LibraryClosed",
      errorCode: "LIBRARY_CLOSED",
    });
  }
  throw new Error("Unknown action");
};
const reducer = createReducer(stateReducer);

const createDocument = () =>
  baseCreateDocument<ListState>(
    (state) => ({
      ...defaultBaseState(),
      global: { books: [] },
      local: {},
      ...state,
    }),
    undefined,
    "acme/reading-list",
  );

const onBaseReducer = (version: number) => {
  const document = createDocument();
  return {
    ...document,
    header: {
      ...document.header,
      protocolVersions: {
        ...document.header.protocolVersions,
        "base-reducer": version,
      },
    },
  };
};

const lastRow = (type: string, version?: number) => {
  const action = createAction(type, {}, undefined, undefined, "global");
  const document = reducer(
    version === undefined ? createDocument() : onBaseReducer(version),
    action,
  );
  return document.operations.global!.at(-1)!;
};

const lastOutcome = (type: string, version?: number) =>
  operationOutcome(lastRow(type, version));

describe("a reducer error on its operation", () => {
  it("keeps the error class's name and code beside its message", () => {
    expect(lastOutcome("FINISH_BOOK")).toStrictEqual({
      kind: "reducer-error",
      message: "Dune has not been started",
      name: "BookNotStartedError",
      code: "BOOK_NOT_STARTED",
    });
  });

  it("has only a message for a plain Error", () => {
    expect(lastOutcome("START_BOOK")).toStrictEqual({
      kind: "reducer-error",
      message: "Unknown action",
    });
  });

  it.each([1, 2, 3])(
    "keeps the name and code on base-reducer %s",
    (version) => {
      expect(lastOutcome("FINISH_BOOK", version)).toStrictEqual({
        kind: "reducer-error",
        message: "Dune has not been started",
        name: "BookNotStartedError",
        code: "BOOK_NOT_STARTED",
      });
    },
  );

  it("gives the failed operation the same hash on every base-reducer", () => {
    const hashes = [1, 2, 3].map(
      (version) => lastRow("FINISH_BOOK", version).hash,
    );
    expect(hashes[1]).toBe(hashes[0]);
    expect(hashes[2]).toBe(hashes[0]);
  });

  it("records a thrown object without a prototype", () => {
    expect(lastOutcome("RETURN_BOOK", 3)).toStrictEqual({
      kind: "reducer-error",
      message: "Action failed",
      name: "LibraryClosed",
      code: "LIBRARY_CLOSED",
    });
  });
});
