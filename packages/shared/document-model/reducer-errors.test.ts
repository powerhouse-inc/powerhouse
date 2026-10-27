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

const lastOutcome = (type: string) => {
  const action = createAction(type, {}, undefined, undefined, "global");
  const document = reducer(createDocument(), action);
  return operationOutcome(document.operations.global!.at(-1)!);
};

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
});
