import type { InProcessReactorClientModule } from "@powerhousedao/reactor";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import { withSignaturePolicy } from "@powerhousedao/shared/document-model";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buildReadGateReactor,
  createFixture,
  openAuthorization,
} from "./utils/read-gate-fixture.js";
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

  beforeAll(async () => {
    module = await buildReadGateReactor();
    owned = await createFixture(module.client, "dm-owned", {
      source: driveDocumentModelModule,
    });
    server = await startReactorHttpServer(module.client, openAuthorization);
  });

  afterAll(async () => {
    await server.close();
    module.reactor.kill();
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
