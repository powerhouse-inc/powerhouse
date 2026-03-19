/**
 * E2E subscription tests against a running switchboard instance.
 *
 * Tests both graphql-ws (WebSocket) and graphql-sse (SSE) transports
 * for the reactor subgraph's documentChanges subscription.
 */
import {
  createClient as createWsClient,
  type ExecutionResult,
} from "graphql-ws";
import { createClient as createSseClient } from "graphql-sse";
import {
  createClient,
  RemoteDocumentController,
} from "@powerhousedao/reactor-browser";
import { DocumentModelController } from "document-model";
import WebSocket from "ws";
import { afterAll, describe, expect, it } from "vitest";

interface DocumentChangesData {
  documentChanges: {
    type: string;
    documents: Array<{
      id: string;
      name: string;
      documentType: string;
    }>;
  };
}

type SubscriptionResult = ExecutionResult<DocumentChangesData>;

const SWITCHBOARD_URL =
  process.env.SWITCHBOARD_URL ?? "http://localhost:4001/graphql";
const DRIVE_ID = process.env.SWITCHBOARD_DRIVE_ID ?? "powerhouse";

// WebSocket URL: the server mounts WS at /graphql/subscriptions
const WS_URL =
  SWITCHBOARD_URL.replace(/^http/, "ws").replace(/\/graphql$/, "") +
  "/graphql/subscriptions";
// SSE URL: append /r/stream to the base graphql path
const SSE_URL = SWITCHBOARD_URL + "/r/stream";

const gqlClient = createClient(SWITCHBOARD_URL);

/** Track created document IDs for cleanup. */
const createdDocumentIds: string[] = [];

const DOCUMENT_CHANGES_QUERY = `
  subscription DocumentChanges($search: SearchFilterInput!) {
    documentChanges(search: $search) {
      type
      documents {
        id
        name
        documentType
      }
    }
  }
`;

/** Helper: subscribe via graphql-ws, resolve on first matching event. */
function wsSubscribe(
  wsClient: ReturnType<typeof createWsClient>,
  variables: Record<string, unknown>,
): { promise: Promise<DocumentChangesData["documentChanges"]>; cancel: () => void } {
  let cancelTimeout: () => void;
  let unsubscribe: () => void;

  const promise = new Promise<DocumentChangesData["documentChanges"]>(
    (resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("WS subscription timed out")),
        15_000,
      );
      cancelTimeout = () => clearTimeout(timeout);

      unsubscribe = wsClient.subscribe<DocumentChangesData>(
        { query: DOCUMENT_CHANGES_QUERY, variables },
        {
          next: (data: SubscriptionResult) => {
            clearTimeout(timeout);
            if (data.data?.documentChanges) {
              resolve(data.data.documentChanges);
            }
          },
          error: (err: unknown) => {
            clearTimeout(timeout);
            reject(err);
          },
          complete: () => {
            clearTimeout(timeout);
            reject(new Error("Subscription completed before event"));
          },
        },
      );
    },
  );

  return {
    promise,
    cancel: () => {
      cancelTimeout?.();
      unsubscribe?.();
    },
  };
}

/** Helper: subscribe via graphql-sse, resolve on first matching event. */
function sseSubscribe(
  sseClient: ReturnType<typeof createSseClient>,
  variables: Record<string, unknown>,
): { promise: Promise<DocumentChangesData["documentChanges"]>; cancel: () => void } {
  let cancelTimeout: () => void;
  let unsubscribe: () => void;

  const promise = new Promise<DocumentChangesData["documentChanges"]>(
    (resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("SSE subscription timed out")),
        15_000,
      );
      cancelTimeout = () => clearTimeout(timeout);

      unsubscribe = sseClient.subscribe<DocumentChangesData>(
        { query: DOCUMENT_CHANGES_QUERY, variables },
        {
          next: (data: SubscriptionResult) => {
            clearTimeout(timeout);
            unsubscribe?.();
            if (data.data?.documentChanges) {
              resolve(data.data.documentChanges);
            }
          },
          error: (err: unknown) => {
            clearTimeout(timeout);
            unsubscribe?.();
            reject(err);
          },
          complete: () => {
            clearTimeout(timeout);
          },
        },
      );
    },
  );

  return {
    promise,
    cancel: () => {
      cancelTimeout?.();
      unsubscribe?.();
    },
  };
}

/** Create a document-model document and push it, returning the document ID. */
async function createAndPushDocument(name: string): Promise<string> {
  const controller = await RemoteDocumentController.pull(
    DocumentModelController,
    {
      client: gqlClient,
      mode: "batch",
      parentIdentifier: DRIVE_ID,
    },
  );
  controller.setName({ name });
  await controller.push();
  const docId = controller.status.documentId;
  createdDocumentIds.push(docId);
  return docId;
}

describe("Subscription e2e", () => {
  afterAll(async () => {
    for (const id of createdDocumentIds) {
      try {
        await gqlClient.DeleteDocument({ identifier: id });
      } catch {
        // ignore cleanup errors
      }
    }
  });

  describe("graphql-ws (WebSocket)", () => {
    it("receives documentChanges event when a document is created", async () => {
      const wsClient = createWsClient({
        url: WS_URL,
        webSocketImpl: WebSocket,
      });

      const sub = wsSubscribe(wsClient, { search: {} });

      try {
        // Give the subscription a moment to connect
        await new Promise((r) => setTimeout(r, 500));

        const docId = await createAndPushDocument("WS Subscription Test");
        const event = await sub.promise;

        expect(event).toBeDefined();
        expect(event.type).toBe("CREATED");
        expect(event.documents).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ id: docId }),
          ]),
        );
      } finally {
        sub.cancel();
        wsClient.dispose();
      }
    });

    it("filters documentChanges by document type", async () => {
      const wsClient = createWsClient({
        url: WS_URL,
        webSocketImpl: WebSocket,
      });

      const sub = wsSubscribe(wsClient, {
        search: { type: "powerhouse/document-model" },
      });

      try {
        await new Promise((r) => setTimeout(r, 500));

        await createAndPushDocument("WS Type Filter Test");
        const event = await sub.promise;

        expect(event.documents).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              documentType: "powerhouse/document-model",
            }),
          ]),
        );
      } finally {
        sub.cancel();
        wsClient.dispose();
      }
    });
  });

  describe("graphql-sse (Server-Sent Events)", () => {
    it("receives documentChanges event when a document is created", async () => {
      const sseClient = createSseClient({ url: SSE_URL });

      const sub = sseSubscribe(sseClient, { search: {} });

      try {
        await new Promise((r) => setTimeout(r, 500));

        const docId = await createAndPushDocument("SSE Subscription Test");
        const event = await sub.promise;

        expect(event).toBeDefined();
        expect(event.type).toBe("CREATED");
        expect(event.documents).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ id: docId }),
          ]),
        );
      } finally {
        sub.cancel();
        sseClient.dispose();
      }
    });

    it("filters documentChanges by document type", async () => {
      const sseClient = createSseClient({ url: SSE_URL });

      const sub = sseSubscribe(sseClient, {
        search: { type: "powerhouse/document-model" },
      });

      try {
        await new Promise((r) => setTimeout(r, 500));

        await createAndPushDocument("SSE Type Filter Test");
        const event = await sub.promise;

        expect(event.documents).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              documentType: "powerhouse/document-model",
            }),
          ]),
        );
      } finally {
        sub.cancel();
        sseClient.dispose();
      }
    });
  });
});
