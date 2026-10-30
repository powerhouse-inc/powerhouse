// A GraphQL endpoint on a real socket for the studio's runtime client tests,
// answering each request with `answer`; open for the file, closed after it.
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll } from "vitest";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type, authorization",
  "access-control-allow-methods": "POST, OPTIONS",
};

export interface GraphqlRequest {
  query: string;
  variables: Record<string, unknown>;
}

export function graphqlServer(answer: (request: GraphqlRequest) => unknown) {
  const endpoint = { url: "", requests: [] as GraphqlRequest[] };
  let server: Server;
  beforeAll(async () => {
    server = createServer((request, response) => {
      if (request.method === "OPTIONS") {
        response.writeHead(204, CORS).end();
        return;
      }
      let body = "";
      request.on("data", (chunk: Buffer) => (body += chunk.toString()));
      request.on("end", () => {
        const parsed = JSON.parse(body) as Partial<GraphqlRequest>;
        const graphql = {
          query: parsed.query ?? "",
          variables: parsed.variables ?? {},
        };
        endpoint.requests.push(graphql);
        response
          .writeHead(200, { ...CORS, "content-type": "application/json" })
          .end(JSON.stringify({ data: answer(graphql) ?? {} }));
      });
    });
    await new Promise<void>((listening) =>
      server.listen(0, "127.0.0.1", listening),
    );
    endpoint.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/graphql`;
  });
  afterAll(() => new Promise<void>((closed) => server.close(() => closed())));
  return endpoint;
}
