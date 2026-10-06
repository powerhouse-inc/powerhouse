import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import {
  actions,
  withSignaturePolicy,
} from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import {
  GraphQLOperationNotSupportedError,
  GraphQLWrongBackendError,
} from "../../src/graphql-client/errors.js";
import { GraphQLReactorClient } from "../../src/graphql-client/graphql-reactor-client.js";

// Reply bodies are what reactor-api's Apollo gateway and drive middleware send.

type Reply = { status: number; contentType?: string; body: string };

type Received = {
  headers: http.IncomingHttpHeaders;
  body: { operationName?: string; query: string; variables?: unknown };
};

type Server = {
  url: string;
  received: Received[];
  close(): Promise<void>;
};

let server: Server | undefined;

afterEach(async () => {
  await server?.close();
  server = undefined;
});

async function serve(reply: (received: Received) => Reply): Promise<Server> {
  const received: Received[] = [];
  const instance = http.createServer((request, response) => {
    let raw = "";
    request.on("data", (chunk: Buffer) => (raw += chunk.toString()));
    request.on("end", () => {
      const entry: Received = {
        headers: request.headers,
        body: JSON.parse(raw) as Received["body"],
      };
      received.push(entry);
      const answer = reply(entry);
      response.writeHead(answer.status, {
        "content-type": answer.contentType ?? "application/json; charset=utf-8",
      });
      response.end(answer.body);
    });
  });
  await new Promise<void>((resolve) =>
    instance.listen(0, "127.0.0.1", resolve),
  );
  const { port } = instance.address() as AddressInfo;
  server = {
    url: `http://127.0.0.1:${port}/graphql/r`,
    received,
    close: () =>
      new Promise<void>((resolve) => instance.close(() => resolve())),
  };
  return server;
}

function clientFor(url: string): GraphQLReactorClient {
  return new GraphQLReactorClient({ url, realtime: false });
}

/** Apollo's answer to a query naming a root field its schema lacks. */
function unknownField(field: string): Reply {
  return {
    status: 400,
    body: JSON.stringify({
      errors: [
        {
          message: `Cannot query field "${field}" on type "Query".`,
          locations: [{ line: 2, column: 3 }],
          extensions: { code: "GRAPHQL_VALIDATION_FAILED" },
        },
      ],
    }),
  };
}

describe("GraphQLReactorClient create defaults over the wire", () => {
  it("reads both defaults from createDefaults", async () => {
    const { url, received } = await serve(() => ({
      status: 200,
      body: JSON.stringify({
        data: {
          createDefaults: {
            signaturePolicy: "legacy",
            protocolVersions: { "base-reducer": 2 },
          },
        },
      }),
    }));
    const client = clientFor(url);

    expect(await client.getCreateSignaturePolicy()).toBe("legacy");
    expect(await client.getCreateProtocolVersions("parent-1")).toEqual({
      "base-reducer": 2,
    });
    expect(received.map((entry) => entry.body.variables)).toEqual([
      {},
      { parentIdOrSlug: "parent-1" },
    ]);
  });

  it("refuses with a typed error against a Switchboard without createDefaults", async () => {
    const { url } = await serve(() => unknownField("createDefaults"));
    const client = clientFor(url);

    await expect(client.getCreateSignaturePolicy()).rejects.toBeInstanceOf(
      GraphQLOperationNotSupportedError,
    );
    await expect(
      client.getCreateProtocolVersions("parent-1"),
    ).rejects.toBeInstanceOf(GraphQLOperationNotSupportedError);
  });
});

describe("GraphQLReactorClient.isServed over the wire", () => {
  it("sends one documentServed query carrying the view", async () => {
    const { url, received } = await serve(() => ({
      status: 200,
      body: JSON.stringify({ data: { documentServed: false } }),
    }));

    expect(await clientFor(url).isServed("doc-1", { branch: "draft" })).toBe(
      false,
    );
    expect(received).toHaveLength(1);
    expect(received[0].body.operationName).toBe("GetDocumentServed");
    expect(received[0].body.variables).toEqual({
      idOrSlug: "doc-1",
      view: { branch: "draft" },
    });
  });

  it("refuses with a typed error against a Switchboard without documentServed", async () => {
    const { url } = await serve(() => unknownField("documentServed"));

    await expect(clientFor(url).isServed("doc-1")).rejects.toBeInstanceOf(
      GraphQLOperationNotSupportedError,
    );
  });
});

const DRIVE_TYPE = "powerhouse/document-drive";
const MODEL_TYPE = "powerhouse/document-model";

function wireDocument(id: string, documentType: string) {
  return {
    id,
    slug: id,
    name: id,
    documentType,
    state: { global: {}, local: {} },
    revisionsList: [{ scope: "global", revision: 1 }],
    createdAtUtcIso: "2026-01-01T00:00:00.000Z",
    lastModifiedAtUtcIso: "2026-01-02T00:00:00.000Z",
  };
}

const documentTypes: Record<string, string> = {
  "drive-1": DRIVE_TYPE,
  "doc-1": MODEL_TYPE,
};

/** A Switchboard that owns every document above. */
function switchboard({ body }: Received): Reply {
  const variables = (body.variables ?? {}) as Record<string, unknown>;
  const data = (() => {
    switch (body.operationName) {
      case "GetDocument": {
        const id = variables.identifier as string;
        return {
          document: {
            document: wireDocument(id, documentTypes[id]),
            childIds: [],
          },
        };
      }
      case "CreateDocument": {
        const header = (variables.document as { header: { id: string } })
          .header;
        return {
          createDocument: wireDocument(
            header.id,
            (variables.document as { header: { documentType: string } }).header
              .documentType,
          ),
        };
      }
      case "MutateDocumentWithOperations": {
        const id = variables.documentIdentifier as string;
        return {
          mutateDocument: {
            ...wireDocument(id, documentTypes[id]),
            operations: { items: [] },
          },
        };
      }
      case "GetDocumentServed":
        return { documentServed: true };
      case "FindDocuments":
        return {
          findDocuments: {
            items: [],
            hasNextPage: false,
            hasPreviousPage: false,
            cursor: null,
          },
        };
      default:
        throw new Error(`unexpected operation ${body.operationName}`);
    }
  })();
  return { status: 200, body: JSON.stringify({ data }) };
}

function driveIdOf(
  received: Received[],
  operationName: string,
): string | undefined {
  const entry = received.find((r) => r.body.operationName === operationName);
  if (!entry) {
    throw new Error(`${operationName} was not sent`);
  }
  return entry.headers["drive-id"] as string | undefined;
}

describe("GraphQLReactorClient Drive-Id", () => {
  it("names a new drive as its own Drive-Id", async () => {
    const { url, received } = await serve(switchboard);
    const drive = withSignaturePolicy(
      driveDocumentModelModule.utils.createDocument(),
      "legacy",
      { id: "drive-new" },
    );

    await clientFor(url).create(drive);

    expect(driveIdOf(received, "CreateDocument")).toBe("drive-new");
  });

  it("sends none when creating a document that is not a drive, even under a parent", async () => {
    const { url, received } = await serve(switchboard);
    const document = withSignaturePolicy(
      documentModelDocumentModelModule.utils.createDocument(),
      "legacy",
      { id: "doc-new" },
    );

    await clientFor(url).create(document, "drive-1");

    expect(driveIdOf(received, "CreateDocument")).toBeUndefined();
  });

  it("names the drive on a write to the drive, not on the read before it", async () => {
    const { url, received } = await serve(switchboard);

    await clientFor(url).execute("drive-1", "main", [
      actions.setName("renamed"),
    ]);

    expect(driveIdOf(received, "GetDocument")).toBeUndefined();
    expect(driveIdOf(received, "MutateDocumentWithOperations")).toBe("drive-1");
  });

  it("sends none on a write to a document that is not a drive", async () => {
    const { url, received } = await serve(switchboard);

    await clientFor(url).execute("doc-1", "main", [actions.setName("renamed")]);

    expect(driveIdOf(received, "MutateDocumentWithOperations")).toBeUndefined();
  });

  it("sends none on reads", async () => {
    const { url, received } = await serve(switchboard);
    const client = clientFor(url);

    await client.get("drive-1");
    await client.isServed("drive-1");
    await client.find({ parentId: "drive-1" });

    expect(received).toHaveLength(3);
    for (const entry of received) {
      expect(entry.headers["drive-id"], entry.body.operationName).toBe(
        undefined,
      );
    }
  });
});

describe("GraphQLReactorClient on a 421", () => {
  // drive-middleware.ts's wrong-shard answer, byte for byte.
  const wrongShard = (driveId: string): Reply => ({
    status: 421,
    contentType: "application/json",
    body: JSON.stringify({ error: "wrong-shard", driveId }),
  });

  it("throws GraphQLWrongBackendError carrying the server's payload", async () => {
    const { url } = await serve(({ body }) =>
      body.operationName === "GetDocument"
        ? switchboard({ headers: {}, body })
        : wrongShard("drive-1"),
    );

    const failure: unknown = await clientFor(url)
      .execute("drive-1", "main", [actions.setName("renamed")])
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(GraphQLWrongBackendError);
    expect(GraphQLWrongBackendError.isError(failure)).toBe(true);
    expect(failure).toMatchObject({
      status: 421,
      driveId: "drive-1",
      payload: { error: "wrong-shard", driveId: "drive-1" },
    });
  });

  it("maps a 421 on any request, not only drive writes", async () => {
    const { url } = await serve(() => wrongShard("drive-9"));

    await expect(clientFor(url).get("doc-1")).rejects.toMatchObject({
      name: "GraphQLWrongBackendError",
      driveId: "drive-9",
    });
  });

  it("keeps a body that is not JSON as text", async () => {
    const { url } = await serve(() => ({
      status: 421,
      contentType: "text/plain",
      body: "misdirected",
    }));

    await expect(clientFor(url).get("doc-1")).rejects.toMatchObject({
      name: "GraphQLWrongBackendError",
      driveId: "",
      payload: "misdirected",
    });
  });

  it("leaves other HTTP failures alone", async () => {
    const { url } = await serve(() => ({ status: 503, body: "{}" }));

    const failure: unknown = await clientFor(url)
      .get("doc-1")
      .catch((error: unknown) => error);

    expect(GraphQLWrongBackendError.isError(failure)).toBe(false);
  });
});
