import type {
  Action,
  ISigner,
  Signature,
} from "@powerhousedao/shared/document-model";
import { serializeSignature } from "@powerhousedao/shared/document-model";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GraphQLReactorClient } from "../../src/graphql-client/graphql-reactor-client.js";
import {
  data,
  DRIVE_TYPE,
  serve,
  switchboard,
  wireDocument,
  type Received,
  type Reply,
  type StubSwitchboard,
} from "./switchboard-stub.js";

const MODEL_TYPE = "powerhouse/document-model";

let stub: StubSwitchboard | undefined;

afterEach(async () => {
  await stub?.close();
  stub = undefined;
});

const signature: Signature = [
  "1700000007",
  "did:key:test",
  "action-hash",
  "prev-hash",
  "0xdeadbeef",
];

function testSigner(): {
  signer: ISigner;
  signAction: ReturnType<typeof vi.fn>;
} {
  const signAction = vi.fn().mockResolvedValue(signature);
  const signer = {
    user: { address: "0x1", networkId: "eip155", chainId: 1 },
    app: { name: "test-app", key: "app-key" },
    signAction,
  } as unknown as ISigner;
  return { signer, signAction };
}

/** The NOT_FOUND refusal the `document` query answers for a missing document. */
function notFound(identifier: string): Reply {
  return {
    status: 200,
    body: JSON.stringify({
      data: null,
      errors: [
        {
          message: `Failed to fetch document: Document not found: ${identifier}`,
          extensions: { code: "NOT_FOUND" },
        },
      ],
    }),
  };
}

/**
 * A Switchboard holding a drive and a document; `drive-slug` names the drive
 * and `doc-slug` the document, and `ghost` is answered NOT_FOUND.
 */
async function serveStore(): Promise<StubSwitchboard> {
  stub = await serve(
    switchboard({ "drive-1": DRIVE_TYPE, "doc-1": MODEL_TYPE }, (received) => {
      const { operationName } = received.body;
      if (
        operationName !== "GetDocument" &&
        operationName !== "GetDocumentAtConsistency"
      ) {
        return undefined;
      }
      const id = (received.body.variables as { idOrSlug: string }).idOrSlug;
      if (id === "ghost") {
        return notFound(id);
      }
      const bySlug: Record<string, [string, string]> = {
        "drive-slug": ["drive-1", DRIVE_TYPE],
        "doc-slug": ["doc-1", MODEL_TYPE],
      };
      const named = bySlug[id];
      return named
        ? data({
            document: { document: wireDocument(...named), childIds: [] },
          })
        : undefined;
    }),
  );
  return stub;
}

function mutations(received: readonly Received[]) {
  return received
    .filter((entry) => entry.body.operationName === "MutateDocumentAsync")
    .map(
      (entry) =>
        entry.body.variables as {
          documentIdOrSlug: string;
          actions: Action[];
          branch: string;
        },
    );
}

function reads(received: readonly Received[]) {
  return received
    .filter((entry) => entry.body.operationName === "GetDocument")
    .map(
      (entry) =>
        entry.body.variables as {
          idOrSlug: string;
          view?: { branch?: string; scopes?: string[] };
        },
    );
}

describe("GraphQLReactorClient relationship writes", () => {
  it("submits an ADD_RELATIONSHIP on the source through executeAsync, by resolved ids", async () => {
    const { url, received } = await serveStore();
    const client = new GraphQLReactorClient({ url, realtime: false });

    const handle = await client.write.addRelationship(
      "drive-slug",
      "doc-slug",
      "child",
      { position: 2 },
      "draft",
    );

    expect(handle.documentId).toBe("drive-1");
    expect(handle.branch).toBe("draft");
    const [mutation] = mutations(received);
    expect(mutation.documentIdOrSlug).toBe("drive-1");
    expect(mutation.branch).toBe("draft");
    expect(mutation.actions).toHaveLength(1);
    expect(mutation.actions[0]).toMatchObject({
      type: "ADD_RELATIONSHIP",
      scope: "document",
      input: {
        sourceId: "drive-1",
        targetId: "doc-1",
        relationshipType: "child",
        metadata: { position: 2 },
      },
    });
    expect(typeof mutation.actions[0].id).toBe("string");
    expect(mutation.actions[0].context?.signer).toBeUndefined();
    expect(reads(received)).toEqual([
      { idOrSlug: "drive-slug", view: { branch: "draft" } },
      { idOrSlug: "doc-slug", view: { branch: "draft", scopes: ["document"] } },
    ]);
  });

  it("leaves metadata out of the input when none is given, on main by default", async () => {
    const { url, received } = await serveStore();
    const client = new GraphQLReactorClient({ url, realtime: false });

    await client.write.addRelationship("drive-1", "doc-1", "child");

    const [mutation] = mutations(received);
    expect(mutation.branch).toBe("main");
    expect(mutation.actions[0].input).toEqual({
      sourceId: "drive-1",
      targetId: "doc-1",
      relationshipType: "child",
    });
  });

  it("signs the action with the client's signer, for the source's log", async () => {
    const { url, received } = await serveStore();
    const { signer, signAction } = testSigner();
    const client = new GraphQLReactorClient({ url, realtime: false, signer });

    await client.write.addRelationship("drive-slug", "doc-1", "child");

    const [mutation] = mutations(received);
    expect(mutation.actions[0].context?.signer?.signatures).toEqual([
      serializeSignature(signature),
    ]);
    expect(mutation.actions[0].context?.signer?.app?.key).toBe("app-key");
    expect(signAction).toHaveBeenCalledTimes(1);
    expect(signAction.mock.calls[0][1]).toEqual({
      documentId: "drive-1",
      branch: "main",
    });
  });

  it("takes a target the Switchboard answers NOT_FOUND for as given", async () => {
    const { url, received } = await serveStore();
    const client = new GraphQLReactorClient({ url, realtime: false });

    await client.write.addRelationship("drive-1", "ghost", "child");

    const [mutation] = mutations(received);
    expect(mutation.actions[0].input).toMatchObject({ targetId: "ghost" });
  });

  it("fails without a mutation when the source does not exist", async () => {
    const { url, received } = await serveStore();
    const client = new GraphQLReactorClient({ url, realtime: false });

    await expect(
      client.write.addRelationship("missing", "doc-1", "child"),
    ).rejects.toThrow("Document not found: missing");
    expect(mutations(received)).toEqual([]);
  });

  it("submits a REMOVE_RELATIONSHIP the same way", async () => {
    const { url, received } = await serveStore();
    const { signer, signAction } = testSigner();
    const client = new GraphQLReactorClient({ url, realtime: false, signer });

    const handle = await client.write.removeRelationship(
      "drive-slug",
      "doc-slug",
      "child",
      "draft",
    );

    expect(handle.documentId).toBe("drive-1");
    const [mutation] = mutations(received);
    expect(mutation.documentIdOrSlug).toBe("drive-1");
    expect(mutation.branch).toBe("draft");
    expect(mutation.actions[0]).toMatchObject({
      type: "REMOVE_RELATIONSHIP",
      scope: "document",
      input: {
        sourceId: "drive-1",
        targetId: "doc-1",
        relationshipType: "child",
      },
    });
    expect(signAction.mock.calls[0][1]).toEqual({
      documentId: "drive-1",
      branch: "draft",
    });
  });

  it("resolves the facade's addRelationship with the source once readable", async () => {
    const { url, received } = await serveStore();
    const client = new GraphQLReactorClient({ url, realtime: false });

    const source = await client.addRelationship("drive-1", "doc-1", "child");

    expect(source.header.id).toBe("drive-1");
    expect(mutations(received)).toHaveLength(1);
    expect(
      received.some((entry) => entry.body.operationName === "GetJobStatus"),
    ).toBe(true);
  });

  it("resolves the facade's removeRelationship with the source", async () => {
    const { url, received } = await serveStore();
    const client = new GraphQLReactorClient({ url, realtime: false });

    const source = await client.removeRelationship("drive-1", "doc-1", "child");

    expect(source.header.id).toBe("drive-1");
    expect(mutations(received)[0].actions[0].type).toBe("REMOVE_RELATIONSHIP");
  });
});

describe("GraphQLReactorClient rename", () => {
  it("submits a signed SET_NAME through executeAsync on the branch given", async () => {
    const { url, received } = await serveStore();
    const { signer, signAction } = testSigner();
    const client = new GraphQLReactorClient({ url, realtime: false, signer });

    const handle = await client.write.rename("doc-slug", "Renamed", "draft");

    expect(handle.documentId).toBe("doc-1");
    const [mutation] = mutations(received);
    expect(mutation.documentIdOrSlug).toBe("doc-slug");
    expect(mutation.branch).toBe("draft");
    expect(mutation.actions[0]).toMatchObject({
      type: "SET_NAME",
      input: { name: "Renamed" },
    });
    expect(mutation.actions[0].context?.signer?.signatures).toEqual([
      serializeSignature(signature),
    ]);
    expect(signAction.mock.calls[0][1]).toEqual({
      documentId: "doc-1",
      branch: "draft",
    });
  });

  it("resolves the facade's rename with the document, on main by default", async () => {
    const { url, received } = await serveStore();
    const client = new GraphQLReactorClient({ url, realtime: false });

    const document = await client.rename("doc-1", "Renamed");

    expect(document.header.id).toBe("doc-1");
    expect(mutations(received)[0].branch).toBe("main");
  });
});
