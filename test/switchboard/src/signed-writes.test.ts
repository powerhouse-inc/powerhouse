import { PropagationMode } from "@powerhousedao/reactor";
import { GraphQLReactorClient } from "@powerhousedao/reactor-browser/graphql-client";
import {
  derivedActionId,
  type ISigner,
  type Operation,
} from "@powerhousedao/shared/document-model";
import { testSigner } from "@powerhousedao/shared/testing";
import { documentModelDocumentModelModule } from "document-model";
import { beforeAll, describe, expect, it } from "vitest";

// F3e: a client with a signer files its creates under a drive itself and
// deletes by its own signed DELETE_DOCUMENT, which the switchboard completes
// as its own work: the caller signs nothing in the drive it did not write.

const SWITCHBOARD_URL =
  process.env.SWITCHBOARD_URL ?? "http://localhost:4001/graphql";
const DRIVE_ID = process.env.SWITCHBOARD_DRIVE_ID ?? "powerhouse";

let signer: ISigner;
let client: GraphQLReactorClient;
let driveId: string;

/** The variables of each `DeleteDocumentSigned` request made while `run` runs. */
async function signedDeletes(run: () => Promise<void>) {
  const sent: { signedDelete: { id: string } }[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    if (typeof init?.body === "string") {
      const body = JSON.parse(init.body) as {
        operationName?: string;
        variables?: { signedDelete: { id: string } };
      };
      if (body.operationName === "DeleteDocumentSigned" && body.variables) {
        sent.push(body.variables);
      }
    }
    return originalFetch(input, init);
  };
  try {
    await run();
  } finally {
    globalThis.fetch = originalFetch;
  }
  return sent;
}

async function operationsOf(
  documentId: string,
  actionTypes: string[],
): Promise<Operation[]> {
  const page = await client.getOperations(
    documentId,
    undefined,
    { actionTypes },
    { cursor: "0", limit: 1000 },
  );
  return page.results;
}

const keyOf = (operation: Operation) =>
  operation.action.context?.signer?.app.key;

beforeAll(async () => {
  signer = await testSigner("0x00000000000000000000000000000000000000e3", {
    app: "e2e-test",
  });
  client = new GraphQLReactorClient({
    url: SWITCHBOARD_URL,
    signer,
    documentModels: [documentModelDocumentModelModule],
    realtime: false,
  });
  driveId = (await client.get(DRIVE_ID)).header.id;
});

describe("a client that signs", () => {
  it("files a create under a drive itself, every action its own", async () => {
    const document = await client.newDocument("powerhouse/document-model", {
      name: "filed-by-client",
    });
    const created = await client.create(document, driveId);

    const filing = (
      await operationsOf(driveId, ["ADD_FILE", "ADD_RELATIONSHIP"])
    ).filter(
      (op) =>
        (op.action.input as { id?: string; targetId?: string }).id ===
          created.header.id ||
        (op.action.input as { targetId?: string }).targetId ===
          created.header.id,
    );
    expect(filing.map((op) => op.action.type).sort()).toEqual([
      "ADD_FILE",
      "ADD_RELATIONSHIP",
    ]);
    for (const op of filing) expect(keyOf(op)).toBe(signer.app?.key);
  });

  it("deletes a filed document by its signed DELETE_DOCUMENT; the switchboard unfiles it as its own work", async () => {
    const document = await client.newDocument("powerhouse/document-model", {
      name: "deleted-by-client",
    });
    const created = await client.create(document, driveId);
    const id = created.header.id;

    const sent = await signedDeletes(() => client.deleteDocument(id));
    expect(sent).toHaveLength(1);
    const signedId = sent[0]!.signedDelete.id;

    const unfiled = (
      await operationsOf(driveId, ["DELETE_NODE", "REMOVE_RELATIONSHIP"])
    ).filter(
      (op) =>
        (op.action.input as { id?: string }).id === id ||
        (op.action.input as { targetId?: string }).targetId === id,
    );
    expect(unfiled.map((op) => op.action.type).sort()).toEqual([
      "DELETE_NODE",
      "REMOVE_RELATIONSHIP",
    ]);
    for (const op of unfiled) {
      expect(keyOf(op)).toBeDefined();
      expect(keyOf(op)).not.toBe(signer.app?.key);
    }
    expect(
      unfiled.find((op) => op.action.type === "DELETE_NODE")!.action.id,
    ).toBe(derivedActionId(signedId, `node:${driveId}`));
    expect(
      unfiled.find((op) => op.action.type === "REMOVE_RELATIONSHIP")!.action.id,
    ).toBe(derivedActionId(signedId, `remove:${driveId}:${id}:child`));
    await expect(client.get(id)).rejects.toThrow();
  });

  it("cascades a signed delete to the orphaned children", async () => {
    const parent = await client.create(
      await client.newDocument("powerhouse/document-model", {
        name: "cascade-parent",
      }),
    );
    const child = await client.create(
      await client.newDocument("powerhouse/document-model", {
        name: "cascade-child",
      }),
      parent.header.id,
    );

    await client.deleteDocument(parent.header.id, PropagationMode.Cascade);

    await expect(client.get(child.header.id)).rejects.toThrow();
    await expect(client.get(parent.header.id)).rejects.toThrow();
  });
});
