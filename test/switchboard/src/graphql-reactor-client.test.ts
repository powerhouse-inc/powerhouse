import { createClient } from "@powerhousedao/reactor-browser";
import { GraphQLReactorClient } from "@powerhousedao/reactor-browser/graphql-client";
import type { Action, PHDocument } from "@powerhousedao/shared/document-model";
import {
  setModelDescription,
  setModelName,
  setName,
} from "@powerhousedao/shared/document-model";
import {
  MemoryKeyStorage,
  RenownCryptoBuilder,
  RenownCryptoSigner,
} from "@renown/sdk/node";
import { documentModelDocumentModelModule } from "document-model";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const SWITCHBOARD_URL =
  process.env.SWITCHBOARD_URL ?? "http://localhost:4001/graphql";

const DRIVE_ID = process.env.SWITCHBOARD_DRIVE_ID ?? "powerhouse";

const client = createClient(SWITCHBOARD_URL);

/** Track created document IDs for cleanup. */
const createdDocumentIds: string[] = [];

const testUser = {
  address: "0x9aDdcBbaA28F7eB5f75E023F7C1Fcb13C9DFD8F7",
  networkId: "eip155",
  chainId: 1,
};

/**
 * Counts the `MutateDocumentWithOperations` requests made while `run` executes,
 * without replacing the real transport: the spy delegates to the original
 * `fetch` and is put back in a `finally`.
 */
async function countMutations<T>(
  run: () => Promise<T>,
): Promise<{ result: T; requests: Record<string, unknown>[] }> {
  const requests: Record<string, unknown>[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    if (typeof init?.body === "string") {
      const body = JSON.parse(init.body) as {
        query?: string;
        variables?: Record<string, unknown>;
      };
      if (body.query?.includes("mutation MutateDocumentWithOperations")) {
        requests.push(body.variables ?? {});
      }
    }
    return originalFetch(input, init);
  };
  try {
    return { result: await run(), requests };
  } finally {
    globalThis.fetch = originalFetch;
  }
}

describe("GraphQLReactorClient signed batches e2e", () => {
  let signer: RenownCryptoSigner;

  beforeAll(async () => {
    const renownCrypto = await new RenownCryptoBuilder()
      .withKeyPairStorage(new MemoryKeyStorage())
      .build();
    signer = new RenownCryptoSigner(renownCrypto, "e2e-test", testUser);
  });

  afterAll(async () => {
    for (const id of createdDocumentIds) {
      try {
        await client.DeleteDocument({ identifier: id });
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  it("sends three sequentially signed actions in one mutation", async () => {
    const created = await client.CreateEmptyDocument({
      documentType: "powerhouse/document-model",
      parentIdentifier: DRIVE_ID,
    });
    const documentId = created.createEmptyDocument.id;
    createdDocumentIds.push(documentId);

    const reactorClient = new GraphQLReactorClient({
      url: SWITCHBOARD_URL,
      realtime: false,
      documentModels: [documentModelDocumentModelModule],
      signer,
    });

    // The revision the batch has to chain onto, read the same way the client
    // reads it.
    const before = await reactorClient.get<PHDocument>(documentId, {
      branch: "main",
    });
    const startRevision = before.header.revision.global;

    const actions: Action[] = [
      setName({ name: "Signed Batch Document" }),
      setModelName({ name: "SignedBatchModel" }),
      setModelDescription({ description: "Written as one signed batch" }),
    ];

    const { requests } = await countMutations(() =>
      reactorClient.execute(documentId, "main", actions),
    );

    // One request, carrying all three actions.
    expect(requests).toHaveLength(1);
    const pushed = requests[0].actions as Action[];
    expect(pushed.map((a) => a.type)).toEqual([
      "SET_NAME",
      "SET_MODEL_NAME",
      "SET_MODEL_DESCRIPTION",
    ]);

    // Every action individually signed, and chained onto the document's head.
    for (const pushedAction of pushed) {
      expect(pushedAction.context?.signer?.user).toEqual(testUser);
      expect(pushedAction.context?.signer?.signatures).toHaveLength(1);
    }
    expect(pushed.map((a) => a.context?.prevOpIndex)).toEqual([
      startRevision - 1,
      startRevision,
      startRevision + 1,
    ]);

    // What the server actually stored: the same three operations, in order,
    // each carrying the signature it was signed with. Read back through the
    // light client's own paged read, i.e. the way an app would.
    const operations = await reactorClient.getOperations(
      documentId,
      { branch: "main", scopes: ["global"] },
      undefined,
      { cursor: "0", limit: 100 },
    );
    const storedBatch = operations.results.slice(-3);
    expect(storedBatch.map((operation) => operation.action.type)).toEqual([
      "SET_NAME",
      "SET_MODEL_NAME",
      "SET_MODEL_DESCRIPTION",
    ]);
    for (const operation of storedBatch) {
      expect(operation.error).toBeFalsy();
      expect(operation.action.context?.signer?.signatures).toHaveLength(1);
    }

    // The chain the client predicted is the chain the server produced: each
    // action's prevOpHash is the hash the previous operation resulted in.
    expect(pushed[1].context?.prevOpHash).toBe(storedBatch[0].hash);
    expect(pushed[2].context?.prevOpHash).toBe(storedBatch[1].hash);

    const after = await reactorClient.get<PHDocument>(documentId, {
      branch: "main",
    });
    expect(after.header.name).toBe("Signed Batch Document");
    // `PHDocument` types only the base scopes; the model's own global state is
    // whatever its reducer writes.
    const globalState = (
      after.state as unknown as {
        global: { name: string; description: string };
      }
    ).global;
    expect(globalState.name).toBe("SignedBatchModel");
    expect(globalState.description).toBe("Written as one signed batch");
    expect(after.header.revision.global).toBe(startRevision + 3);
  });
});
