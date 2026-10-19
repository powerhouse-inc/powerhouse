import type { InProcessReactorClientModule } from "@powerhousedao/reactor";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import {
  initializeAuth,
  withSignaturePolicy,
  type ISigner,
} from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buildReadGateReactor,
  createFixture,
  HOST,
  openAuthorization,
  READER,
  type ReadGateClient,
} from "./utils/read-gate-fixture.js";
import { createTestSigner } from "./utils/test-signer.js";
import {
  startReactorHttpServer,
  type ReactorHttpServer,
} from "./utils/reactor-http-server.js";

// The operations as reactor-browser's GraphQLReactorClient names and sends them.
const CREATE_DOCUMENT = /* GraphQL */ `
  mutation CreateDocument($document: JSONObject!, $parentIdentifier: String) {
    createDocument(document: $document, parentIdentifier: $parentIdentifier) {
      id
    }
  }
`;

const MUTATE_DOCUMENT = /* GraphQL */ `
  mutation MutateDocumentWithOperations(
    $documentIdentifier: String!
    $actions: [JSONObject!]!
  ) {
    mutateDocument(documentIdentifier: $documentIdentifier, actions: $actions) {
      id
    }
  }
`;

/** Grants READER alone, so the host's own key may neither read nor write it. */
async function lockOutHost(client: ReadGateClient, id: string): Promise<void> {
  await client.execute(id, "main", [
    initializeAuth({
      version: 1,
      grants: [
        {
          id: "reader-reads",
          description: "only the reader reads",
          effect: "allow",
          principal: { address: READER },
          capability: { can: "read", scope: "global" },
        },
        {
          id: "reader-manages",
          description: "only the reader manages the policy",
          effect: "allow",
          principal: { address: READER },
          capability: { can: "execute", scope: "auth" },
        },
      ],
    }),
  ]);
  if ((await client.find({ ids: [id] })).results.length !== 0) {
    throw new Error(`${id} is still served to the host`);
  }
}

/** Whether the request got past the drive middleware to the resolvers. */
function reachedResolvers(response: { status: number; body: unknown }) {
  return (
    response.status === 200 &&
    (response.body as { error?: unknown }).error === undefined
  );
}

function renameDrive(name: string) {
  return {
    id: crypto.randomUUID(),
    type: "SET_DRIVE_NAME",
    timestampUtcMs: new Date().toISOString(),
    input: { name },
    scope: "global",
  };
}

const GET_DOCUMENT = /* GraphQL */ `
  query GetDocument($identifier: String!) {
    document(identifier: $identifier) {
      document {
        id
      }
    }
  }
`;

async function post(
  server: ReactorHttpServer,
  operationName: string,
  query: string,
  variables: Record<string, unknown>,
  driveId?: string,
): Promise<{ status: number; body: unknown }> {
  const response = await fetch(server.url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(driveId === undefined ? {} : { "Drive-Id": driveId }),
    },
    body: JSON.stringify({ operationName, query, variables }),
  });
  return { status: response.status, body: await response.json() };
}

describe("the drive middleware in front of the reactor subgraph", () => {
  let module: InProcessReactorClientModule;
  let server: ReactorHttpServer;
  let owned: string;
  let protectedAtBoot: string;

  let signer: ISigner;

  beforeAll(async () => {
    // Shared with the sync peer, so the host accepts the peer's signatures.
    signer = await createTestSigner(HOST);
    module = await buildReadGateReactor([], signer);
    owned = await createFixture(module.client, "dm-owned", {
      source: driveDocumentModelModule,
    });
    protectedAtBoot = await createFixture(module.client, "dm-protected-boot", {
      source: driveDocumentModelModule,
    });
    await lockOutHost(module.client, protectedAtBoot);
    server = await startReactorHttpServer(
      module.client,
      openAuthorization,
      module.reactor,
    );
  });

  afterAll(async () => {
    await server.close();
    module.reactor.kill();
  });

  it("accepts a stamped write to a drive added after the server started", async () => {
    // As the Switchboard adds its default drive: on the reactor, after init.
    const late = await createFixture(module.client, "dm-late", {
      source: driveDocumentModelModule,
    });

    const response = await post(
      server,
      "MutateDocumentWithOperations",
      MUTATE_DOCUMENT,
      { documentIdentifier: late, actions: [renameDrive("late")] },
      late,
    );

    expect(response).toEqual({
      status: 200,
      body: { data: { mutateDocument: { id: late } } },
    });
  });

  it("routes a stamped write to a protected drive it held at boot here", async () => {
    const response = await post(
      server,
      "MutateDocumentWithOperations",
      MUTATE_DOCUMENT,
      { documentIdentifier: protectedAtBoot, actions: [renameDrive("boot")] },
      protectedAtBoot,
    );

    expect(reachedResolvers(response), JSON.stringify(response)).toBe(true);
  });

  it("routes a stamped write to a protected drive added after start here", async () => {
    const late = await createFixture(module.client, "dm-protected-late", {
      source: driveDocumentModelModule,
    });
    await lockOutHost(module.client, late);

    const response = await post(
      server,
      "MutateDocumentWithOperations",
      MUTATE_DOCUMENT,
      { documentIdentifier: late, actions: [renameDrive("late")] },
      late,
    );

    expect(reachedResolvers(response), JSON.stringify(response)).toBe(true);
  });

  it("accepts a stamped write to a drive that arrived by sync", async () => {
    const peer = await buildReadGateReactor([], signer);
    try {
      const synced = await createFixture(peer.client, "dm-synced", {
        source: driveDocumentModelModule,
      });
      const operations = await peer.reactor.getOperations(synced, {
        branch: "main",
        scopes: ["document"],
      });
      const loaded = await module.reactor.load(
        synced,
        "main",
        operations.document.results,
      );
      expect((await module.client.waitForJob(loaded)).status).toBe(
        "READ_READY",
      );

      const response = await post(
        server,
        "MutateDocumentWithOperations",
        MUTATE_DOCUMENT,
        { documentIdentifier: synced, actions: [renameDrive("synced")] },
        synced,
      );

      expect(response).toEqual({
        status: 200,
        body: { data: { mutateDocument: { id: synced } } },
      });
    } finally {
      peer.reactor.kill();
    }
  });

  it("refuses a stamped write naming a document that is not a drive", async () => {
    const plain = await createFixture(module.client, "dm-plain");

    const response = await post(
      server,
      "MutateDocumentWithOperations",
      MUTATE_DOCUMENT,
      { documentIdentifier: plain, actions: [renameDrive("plain")] },
      plain,
    );

    expect(response.status).toBe(421);
  });

  it("refuses a hinted child create under a drive this server does not hold", async () => {
    const child = withSignaturePolicy(
      documentModelDocumentModelModule.utils.createDocument(),
      "legacy",
      { id: "dm-child" },
    );

    const response = await post(
      server,
      "CreateDocument",
      CREATE_DOCUMENT,
      { document: child, parentIdentifier: "dm-elsewhere" },
      "dm-elsewhere",
    );

    expect(response).toEqual({
      status: 421,
      body: { error: "wrong-shard", driveId: "dm-elsewhere" },
    });
  });

  it("serves a request naming a drive this server owns", async () => {
    const response = await post(
      server,
      "GetDocument",
      GET_DOCUMENT,
      { identifier: owned },
      owned,
    );

    expect(response.status).toBe(200);
  });

  it("refuses a request naming a drive this server does not own with 421", async () => {
    const response = await post(
      server,
      "GetDocument",
      GET_DOCUMENT,
      { identifier: owned },
      "elsewhere",
    );

    expect(response).toEqual({
      status: 421,
      body: { error: "wrong-shard", driveId: "elsewhere" },
    });
  });

  it("lets the client create a drive under the new drive's own id", async () => {
    const drive = withSignaturePolicy(
      driveDocumentModelModule.utils.createDocument(),
      "legacy",
      { id: "dm-created" },
    );

    const created = await post(
      server,
      "CreateDocument",
      CREATE_DOCUMENT,
      { document: drive },
      "dm-created",
    );
    const after = await post(
      server,
      "GetDocument",
      GET_DOCUMENT,
      { identifier: "dm-created" },
      "dm-created",
    );

    expect(created.status).toBe(200);
    expect(created.body).toEqual({
      data: { createDocument: { id: "dm-created" } },
    });
    expect(after.status).toBe(200);
  });
});
