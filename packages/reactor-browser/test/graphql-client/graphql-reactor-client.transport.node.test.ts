import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { GraphQLOperationNotSupportedError } from "../../src/graphql-client/errors.js";
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
