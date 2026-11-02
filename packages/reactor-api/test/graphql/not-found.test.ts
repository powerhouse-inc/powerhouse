import type { IReactorReadClient } from "@powerhousedao/reactor";
import { GraphQLError } from "graphql";
import { describe, expect, it } from "vitest";
import * as resolvers from "../../src/graphql/reactor/resolvers.js";

class DocumentNotFoundError extends Error {
  constructor(id: string) {
    super(`Document not found: ${id}`);
    this.name = "DocumentNotFoundError";
  }
}

function readThatThrows(error: Error): IReactorReadClient {
  const fail = () => Promise.reject(error);
  return { get: fail, getOperations: fail } as unknown as IReactorReadClient;
}

async function caught(promise: Promise<unknown>): Promise<GraphQLError> {
  try {
    await promise;
  } catch (error) {
    return error as GraphQLError;
  }
  throw new Error("expected the resolver to throw");
}

describe("a document that does not exist", () => {
  it("is NOT_FOUND from the document resolver, not a bare failure", async () => {
    const error = await caught(
      resolvers.document(readThatThrows(new DocumentNotFoundError("gone")), {
        idOrSlug: "gone",
      }),
    );
    expect(error).toBeInstanceOf(GraphQLError);
    expect(error.message).toBe(
      "Failed to fetch document: Document not found: gone",
    );
    expect(error.extensions.code).toBe("NOT_FOUND");
    expect(resolvers.isNotFoundError(error)).toBe(true);
  });

  it("is NOT_FOUND from the operations resolver too", async () => {
    const error = await caught(
      resolvers.documentOperations(
        readThatThrows(new DocumentNotFoundError("gone")),
        { filter: { documentIdOrSlug: "gone" } },
      ),
    );
    expect(error.extensions.code).toBe("NOT_FOUND");
  });

  it("leaves any other failure without the code, so it is still logged as an error", async () => {
    const error = await caught(
      resolvers.document(readThatThrows(new Error("database down")), {
        idOrSlug: "x",
      }),
    );
    expect(error.extensions.code).toBeUndefined();
    expect(resolvers.isNotFoundError(error)).toBe(false);
    expect(resolvers.isNotFoundError(new DocumentNotFoundError("y"))).toBe(
      true,
    );
    expect(resolvers.isNotFoundError("nope")).toBe(false);
  });
});
