import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { GraphQLReactorClient } from "../../src/graphql-client/graphql-reactor-client.js";

type Received = {
  headers: http.IncomingHttpHeaders;
  body: {
    operationName?: string;
    query: string;
    variables: Record<string, unknown>;
  };
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

function documentFields(id: string) {
  return {
    id,
    slug: `${id}-slug`,
    name: `Name ${id}`,
    documentType: "powerhouse/test",
    state: { global: { name: id }, local: {} },
    createdAtUtcIso: "2026-01-01T00:00:00.000Z",
    lastModifiedAtUtcIso: "2026-01-02T00:00:00.000Z",
    revisionsList: [{ scope: "global", revision: 1 }],
  };
}

/** Answers each aliased `dN` field from the `idN` variable; ids in `missing` come back null. */
async function serve(
  missing: ReadonlySet<string> = new Set(),
): Promise<Server> {
  const received: Received[] = [];
  const instance = http.createServer((request, response) => {
    let raw = "";
    request.on("data", (chunk: Buffer) => (raw += chunk.toString()));
    request.on("end", () => {
      const body = JSON.parse(raw) as Received["body"];
      received.push({ headers: request.headers, body });
      const data: Record<string, unknown> = {};
      for (const [name, value] of Object.entries(body.variables)) {
        const index = /^id(\d+)$/.exec(name)?.[1];
        if (index === undefined || typeof value !== "string") continue;
        data[`d${index}`] = missing.has(value)
          ? null
          : { document: documentFields(value), childIds: [] };
      }
      response.writeHead(200, {
        "content-type": "application/json; charset=utf-8",
      });
      response.end(JSON.stringify({ data }));
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

const ids = (count: number) =>
  Array.from({ length: count }, (_, i) => `doc-${i}`);

const aliasCount = (query: string) =>
  (query.match(/\bd\d+: document\(/g) ?? []).length;

describe("GraphQLReactorClient.getMany", () => {
  it("reads 240 ids in 5 requests of at most 50 aliased document fields, in order", async () => {
    const { url, received } = await serve();
    const client = new GraphQLReactorClient({ url, realtime: false });
    const all = ids(240);

    const documents = await client.getMany(all);

    expect(documents.map((d) => d.header.id)).toEqual(all);
    expect(documents[7].header.slug).toBe("doc-7-slug");
    expect(documents[7].state).toEqual({
      global: { name: "doc-7" },
      local: {},
    });
    expect(received).toHaveLength(5);
    expect(received.map((r) => aliasCount(r.body.query))).toEqual([
      50, 50, 50, 50, 40,
    ]);
    const asked = received
      .map((r) => r.body.variables)
      .sort((a, b) =>
        String(a.id0).localeCompare(String(b.id0), "en", { numeric: true }),
      )
      .flatMap((variables) =>
        Object.keys(variables)
          .filter((name) => name.startsWith("id"))
          .sort((a, b) => Number(a.slice(2)) - Number(b.slice(2)))
          .map((name) => variables[name]),
      );
    expect(asked).toEqual(all);
    for (const { body, headers } of received) {
      expect(body.operationName).toBe("GetDocuments");
      expect(body.query).toContain("fragment PHDocumentFields on PHDocument");
      expect(headers["drive-id"]).toBeUndefined();
    }
  });

  it("sends the view to every aliased field", async () => {
    const { url, received } = await serve();
    const client = new GraphQLReactorClient({ url, realtime: false });

    await client.getMany(["a", "b"], { branch: "main", scopes: ["global"] });

    expect(received).toHaveLength(1);
    expect(received[0].body.variables.view).toEqual({
      branch: "main",
      scopes: ["global"],
    });
    expect(received[0].body.query).toContain(
      "d1: document(identifier: $id1, view: $view)",
    );
  });

  it("rejects with get's not-found error when an id is missing", async () => {
    const { url } = await serve(new Set(["doc-3"]));
    const client = new GraphQLReactorClient({ url, realtime: false });

    await expect(client.getMany(ids(5))).rejects.toThrow(
      "Document not found: doc-3",
    );
  });
});
