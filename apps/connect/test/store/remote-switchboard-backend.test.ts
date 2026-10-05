import {
  isOperationNotSupported,
  ReactorOperationNotSupportedError,
} from "@powerhousedao/reactor-router";
import { describe, expect, it } from "vitest";
import { createRemoteSwitchboardBackend } from "../../src/store/remote-switchboard-backend.js";

function backendClient() {
  return createRemoteSwitchboardBackend({
    name: "switchboard-remote",
    graphqlUrl: "http://localhost:4001/graphql",
  }).client;
}

describe("remote Switchboard backend drives sub-proxy", () => {
  it("await client.drives resolves to the drives proxy and does not reject", async () => {
    const client = backendClient();

    // Before the `then` guard on the sub-proxy, resolving `client.drives` saw a
    // throwing `then` stub, treated the object as a thenable, and rejected with
    // a 'not supported' error. It must resolve to the proxy object instead.
    // Promise.resolve routes through the same thenable detection `await` uses.
    const drives = await Promise.resolve(client.drives);

    expect(drives).toBeDefined();
    expect(typeof drives).toBe("object");
  });

  it("still refuses a real drives method by name", () => {
    const client = backendClient();
    const drives = client.drives as unknown as { addDrive: () => unknown };

    expect(() => drives.addDrive()).toThrow(
      /does not support "drives\.addDrive"/,
    );
  });
});

describe("remote Switchboard backend read surface", () => {
  it("serves find by delegating to the GraphQL client rather than refusing", () => {
    const client = backendClient();
    // A `type`/`parentId` search is what the Switchboard findDocuments query
    // honours and what drive enumeration issues, so find must delegate (a
    // thenable), not throw the typed not-supported signal. No server is
    // reachable in this unit test, so the returned promise rejects on the
    // network; swallow it rather than letting it surface as unhandled.
    const result = (
      client as unknown as { find: (search: unknown) => Promise<unknown> }
    ).find({ type: "powerhouse/document-drive" });

    expect(typeof result.then).toBe("function");
    result.catch(() => undefined);
  });

  it("refuses a find naming ids with the typed signal the router excludes on", () => {
    const client = backendClient();
    let thrown: unknown;
    try {
      (client as unknown as { find: (search: unknown) => unknown }).find({
        ids: ["doc-1"],
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ReactorOperationNotSupportedError);
    expect(isOperationNotSupported(thrown)).toBe(true);
    const typed = thrown as ReactorOperationNotSupportedError;
    expect(typed.backend).toBe("switchboard-remote");
    expect(typed.operation).toBe("find");
    expect(typed.message).toMatch(/type and parentId/);
  });

  it("refuses a find naming slugs with the typed signal", () => {
    const client = backendClient();

    expect(() =>
      (client as unknown as { find: (search: unknown) => unknown }).find({
        slugs: ["my-doc"],
      }),
    ).toThrow(ReactorOperationNotSupportedError);
  });

  it("refuses a find with a present-but-empty ids array, never returning rows", () => {
    const client = backendClient();
    let thrown: unknown;
    try {
      (client as unknown as { find: (search: unknown) => unknown }).find({
        ids: [],
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ReactorOperationNotSupportedError);
    expect(isOperationNotSupported(thrown)).toBe(true);
  });

  it("refuses a find with a present-but-empty slugs array", () => {
    const client = backendClient();

    expect(() =>
      (client as unknown as { find: (search: unknown) => unknown }).find({
        slugs: [],
      }),
    ).toThrow(ReactorOperationNotSupportedError);
  });

  it("refuses a mixed type-and-empty-ids find rather than serving all of the type", () => {
    const client = backendClient();

    expect(() =>
      (client as unknown as { find: (search: unknown) => unknown }).find({
        type: "x",
        ids: [],
      }),
    ).toThrow(ReactorOperationNotSupportedError);
  });

  it("refuses a point-in-time view find with the typed signal, not a plain error", () => {
    const client = backendClient();
    let thrown: unknown;
    try {
      (
        client as unknown as {
          find: (search: unknown, view: unknown) => unknown;
        }
      ).find({ type: "powerhouse/document-drive" }, { revision: 3 });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ReactorOperationNotSupportedError);
    expect(isOperationNotSupported(thrown)).toBe(true);
    const typed = thrown as ReactorOperationNotSupportedError;
    expect(typed.operation).toBe("find");
  });

  it("serves a latest-view (no revision) find by delegating rather than refusing", () => {
    const client = backendClient();
    const result = (
      client as unknown as {
        find: (search: unknown, view: unknown) => Promise<unknown>;
      }
    ).find({ type: "powerhouse/document-drive" }, { branch: "draft" });

    expect(typeof result.then).toBe("function");
    result.catch(() => undefined);
  });

  it("serves the relationship reads by delegating to the GraphQL client", () => {
    const client = backendClient();
    const relationshipClient = client as unknown as {
      getOutgoingRelationships: (id: string, type: string) => Promise<unknown>;
      getIncomingRelationshipEdges: (id: string) => Promise<unknown>;
    };

    const outgoing = relationshipClient.getOutgoingRelationships(
      "doc-1",
      "cites",
    );
    const edges = relationshipClient.getIncomingRelationshipEdges("doc-2");

    expect(typeof outgoing.then).toBe("function");
    expect(typeof edges.then).toBe("function");
    outgoing.catch(() => undefined);
    edges.catch(() => undefined);
  });
});

describe("remote Switchboard backend unsupported-operation signal", () => {
  it("refuses a still-unsupported member with a typed error the router recognises", () => {
    const client = backendClient();
    // A relationship WRITE is not part of the v1 read surface; it must throw the
    // TYPED error the router recognises rather than a generic Error.
    let thrown: unknown;
    try {
      (
        client as unknown as { addRelationship: () => unknown }
      ).addRelationship();
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ReactorOperationNotSupportedError);
    expect(isOperationNotSupported(thrown)).toBe(true);
    const typed = thrown as ReactorOperationNotSupportedError;
    expect(typed.backend).toBe("switchboard-remote");
    expect(typed.operation).toBe("addRelationship");
    // The helpful served-methods message content is preserved.
    expect(typed.message).toMatch(/get, subscribe, execute/);
  });
});
