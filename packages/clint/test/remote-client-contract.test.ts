/**
 * The client clint's powerhouse integration gets on a remote attach is a
 * `GraphQLReactorClient`, cast to the full `TypedReactorClient`
 * (`attachDefaultReactor`), so the type check cannot see a call it lacks:
 * such a call only throws at run time. This holds a real client to every
 * call the integration makes.
 */
import { GraphQLReactorClient } from "@powerhousedao/reactor-browser/graphql-client";
import { describe, expect, it } from "vitest";

/** What `attachDefaultReactor`, `ensureDrive`, the change trigger, the
 * subscription bridge, the read tools and the folder operations call on the
 * facade. */
const FACADE_CALLS = [
  "get",
  "find",
  "newDocument",
  "subscribe",
  "dispose",
  "notifyCredentialsChanged",
] as const;

/** What they and the folder operations call on the write half. */
const WRITE_CALLS = [
  "create",
  "execute",
  "rename",
  "addRelationship",
  "removeRelationship",
] as const;

function remoteClient(): GraphQLReactorClient {
  // Nothing is requested until a call is made.
  return new GraphQLReactorClient({
    url: "http://127.0.0.1:1/graphql",
    realtime: false,
  });
}

describe("the remote client contract", () => {
  it.each(FACADE_CALLS)("has %s", (name) => {
    expect(typeof remoteClient()[name]).toBe("function");
  });

  it.each(WRITE_CALLS)("has write.%s", (name) => {
    expect(typeof remoteClient().write[name]).toBe("function");
  });
});
