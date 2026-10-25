import type { IReactorClient } from "@powerhousedao/reactor";
import { describe, expect, expectTypeOf, it } from "vitest";
import type { GraphQLReactorClient } from "../../src/graphql-client/graphql-reactor-client.js";
import type {
  IReactorBrowserClient,
  IReactorBrowserReadClient,
  IReactorBrowserWriteClient,
} from "../../src/types/reactor-browser-client.js";

describe("IReactorBrowserClient", () => {
  it("is satisfied by the full IReactorClient", () => {
    expectTypeOf<IReactorClient>().toExtend<IReactorBrowserClient>();
    expect(true).toBe(true);
  });

  it("is satisfied by the GraphQL client", () => {
    expectTypeOf<GraphQLReactorClient>().toExtend<IReactorBrowserClient>();
    expect(true).toBe(true);
  });

  it("exposes the seven agreed facade members and the two halves", () => {
    expectTypeOf<keyof IReactorBrowserClient>().toEqualTypeOf<
      | "get"
      | "find"
      | "subscribe"
      | "execute"
      | "getOperations"
      | "create"
      | "deleteDocument"
      | "read"
      | "write"
    >();
    expect(true).toBe(true);
  });

  it("reads through the agreed read members", () => {
    expectTypeOf<keyof IReactorBrowserReadClient>().toEqualTypeOf<
      | "get"
      | "getMany"
      | "find"
      | "getOperations"
      | "subscribe"
      | "waitForJob"
      | "getJobStatus"
    >();
    expect(true).toBe(true);
  });

  it("writes through the agreed write members", () => {
    expectTypeOf<keyof IReactorBrowserWriteClient>().toEqualTypeOf<
      "execute" | "create" | "deleteDocument"
    >();
    expect(true).toBe(true);
  });

  it("does not expose the drive client", () => {
    expectTypeOf<
      "drives" extends keyof IReactorBrowserClient ? true : false
    >().toEqualTypeOf<false>();
    expect(true).toBe(true);
  });
});
