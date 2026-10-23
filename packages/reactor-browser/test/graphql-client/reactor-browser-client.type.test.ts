import type { IReactorClient } from "@powerhousedao/reactor";
import { describe, expect, expectTypeOf, it } from "vitest";
import type { IReactorBrowserClient } from "../../src/types/reactor-browser-client.js";

describe("IReactorBrowserClient", () => {
  it("is satisfied by the full IReactorClient", () => {
    expectTypeOf<IReactorClient>().toExtend<IReactorBrowserClient>();
    expect(true).toBe(true);
  });

  it("exposes exactly the agreed members", () => {
    expectTypeOf<keyof IReactorBrowserClient>().toEqualTypeOf<
      | "get"
      | "find"
      | "subscribe"
      | "execute"
      | "getOperations"
      | "newDocument"
      | "create"
      | "deleteDocument"
      | "undo"
      | "redo"
      | "undoRedoTargets"
      | "undoRedoAvailability"
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
