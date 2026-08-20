import { RECOVERABLE_GRAPHQL_ERROR_CODES } from "@powerhousedao/reactor";
import type { Operation } from "@powerhousedao/shared/document-model";
import { GraphQLError } from "graphql";
import { describe, expect, it } from "vitest";
import { serializeOperationForGraphQL } from "../src/graphql/reactor/adapters.js";

const CODE = RECOVERABLE_GRAPHQL_ERROR_CODES.malformedStoredOperation;

function storedOperation(overrides: Partial<Operation> = {}): Operation {
  return {
    id: "op-1",
    index: 0,
    skip: 0,
    hash: "h",
    timestampUtcMs: "2026-01-01T00:00:00.000Z",
    action: {
      id: "act-1",
      type: "SET_NAME",
      scope: "global",
      input: { name: "x" },
      timestampUtcMs: "2026-01-01T00:00:00.000Z",
    },
    ...overrides,
  } as Operation;
}

/** The extensions code, or undefined for anything not carrying one. */
function codeOf(error: unknown): unknown {
  return error instanceof GraphQLError ? error.extensions.code : undefined;
}

function serializeError(operation: Operation): unknown {
  try {
    serializeOperationForGraphQL(operation);
  } catch (error) {
    return error;
  }
  throw new Error("expected serialization to be refused");
}

describe("serving an operation the schema cannot represent", () => {
  it("refuses an action with no id, rather than nulling a non-null field", () => {
    const operation = storedOperation({
      action: {
        ...storedOperation().action,
        id: undefined as unknown as string,
      },
    });

    const error = serializeError(operation);

    expect(codeOf(error)).toBe(CODE);
    expect((error as Error).message).toContain("action with no id");
  });

  it("names the operation, so the row can be found", () => {
    const operation = storedOperation({
      id: "op-deadbeef",
      index: 7,
      action: {
        ...storedOperation().action,
        id: null as unknown as string,
      },
    });

    const error = serializeError(operation);

    expect((error as Error).message).toContain("op-deadbeef");
    expect((error as Error).message).toContain("index 7");
    expect((error as Error).message).toContain("scope global");
  });

  it("refuses an action with no id even when the id is empty", () => {
    // An empty id derives the same colliding operation id as an absent one, but
    // it is a string, so the schema would serve it. Presence is all this checks;
    // rejecting the empty string is the storage constraint's job.
    const operation = storedOperation({
      action: { ...storedOperation().action, id: "" },
    });

    expect(() => serializeOperationForGraphQL(operation)).not.toThrow();
  });

  it.each([
    ["type", { type: undefined }],
    ["timestampUtcMs", { timestampUtcMs: undefined }],
    ["input", { input: undefined }],
    ["scope", { scope: undefined }],
  ])("refuses an action with no %s", (field, patch) => {
    const operation = storedOperation({
      action: { ...storedOperation().action, ...patch } as Operation["action"],
    });

    const error = serializeError(operation);

    expect(codeOf(error)).toBe(CODE);
    expect((error as Error).message).toContain(`action with no ${field}`);
  });

  it.each([
    ["hash", { hash: undefined }],
    ["timestampUtcMs", { timestampUtcMs: undefined }],
    ["skip", { skip: undefined }],
    ["index", { index: undefined }],
  ])("refuses an operation with no %s", (field, patch) => {
    const error = serializeError(
      storedOperation(patch as unknown as Partial<Operation>),
    );

    expect(codeOf(error)).toBe(CODE);
    expect((error as Error).message).toContain(`has no ${field}`);
  });

  it("refuses an operation with no action at all", () => {
    const error = serializeError(
      storedOperation({ action: undefined as unknown as Operation["action"] }),
    );

    expect(codeOf(error)).toBe(CODE);
    expect((error as Error).message).toContain("has no action");
  });

  it("serves an operation that carries everything the schema declares", () => {
    const served = serializeOperationForGraphQL(storedOperation());

    expect(served.action.id).toBe("act-1");
    expect(served.index).toBe(0);
  });

  it("still flattens signature tuples on a well-formed operation", () => {
    const base = storedOperation();
    const operation = {
      ...base,
      action: {
        ...base.action,
        context: {
          signer: {
            user: { address: "0x1", networkId: "eip155", chainId: 1 },
            app: { name: "Connect", key: "k" },
            signatures: [["a", "b", "c", "d", "e"]],
          },
        },
      },
    } as unknown as Operation;

    const served = serializeOperationForGraphQL(operation);

    expect(served.action.context?.signer?.signatures).toEqual([
      "a, b, c, d, e",
    ]);
  });
});
