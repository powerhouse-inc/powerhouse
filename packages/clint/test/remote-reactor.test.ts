import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  attachRemoteReactor,
  deriveGraphqlEndpoint,
} from "../src/integrations/powerhouse/remote-reactor.js";

describe("deriveGraphqlEndpoint", () => {
  it("derives from a drive url, a graphql url, and a bare origin", () => {
    expect(deriveGraphqlEndpoint("http://localhost:4001/d/powerhouse")).toBe(
      "http://localhost:4001/graphql",
    );
    expect(deriveGraphqlEndpoint("http://localhost:4001/graphql")).toBe(
      "http://localhost:4001/graphql",
    );
    expect(deriveGraphqlEndpoint("http://localhost:4001")).toBe(
      "http://localhost:4001/graphql",
    );
    expect(deriveGraphqlEndpoint("https://sb.example/base/graphql/")).toBe(
      "https://sb.example/base/graphql",
    );
  });
});

describe("attachRemoteReactor", () => {
  let server: Server;
  let port: number;

  beforeAll(async () => {
    server = createServer((req, res) => {
      if (req.url?.endsWith("/inspection")) {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            data: { inspection: { info: { name: "fake-switchboard" } } },
          }),
        );
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ data: { __typename: "Query" } }));
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    port = (server.address() as { port: number }).port;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  it("attaches to a listening switchboard and reads inspection facts", async () => {
    const attachment = await attachRemoteReactor({
      url: `http://127.0.0.1:${port}/d/powerhouse`,
      documentModels: [],
    });
    expect(attachment.endpoint).toBe(`http://127.0.0.1:${port}/graphql`);
    expect(attachment.client).toBeDefined();
    expect(attachment.remoteInfo).toEqual({ name: "fake-switchboard" });
  });

  it("fails the attach LOUDLY with the start hint when nothing listens", async () => {
    await expect(
      attachRemoteReactor({
        url: "http://127.0.0.1:1/graphql",
        documentModels: [],
        timeoutMs: 1500,
      }),
    ).rejects.toThrow(/never\s+starts one.*ph run switchboard/s);
  });
});
