import { describe, expect, it } from "vitest";
import { ExpressHttpAdapter } from "../src/graphql/gateway/adapter-http-express.js";
import { config } from "../src/config.js";
import { getExplorerPrefix } from "../src/server.js";

/**
 * The explorer page must be reachable at `<basePath>/explorer` with exactly
 * one slash. A naive `${basePath}/explorer` join produces `//explorer` when
 * basePath is the default `/`, and express (path-to-regexp 0.1.x) compiles
 * that into `/^\/\/explorer.../` — so `GET /explorer` 404s and the GraphiQL
 * page never loads.
 */
describe("explorer route registration", () => {
  it("normalizes the explorer prefix for the default (trailing-slash) basePath", () => {
    expect(getExplorerPrefix("/")).toBe("/explorer");
  });

  it("preserves a nested basePath", () => {
    expect(getExplorerPrefix("/api/reactor")).toBe("/api/reactor/explorer");
  });

  it("matches a single-slash GET /explorer and its endpoint variant", async () => {
    const adapter = new ExpressHttpAdapter();
    adapter.setupMiddleware({});
    const server = await adapter.listen(0);
    const { port } = server.address() as { port: number };
    try {
      adapter.getRoute(
        `${getExplorerPrefix(config.basePath)}/:endpoint?`,
        () => new Response("graphiql", { status: 200 }),
      );

      for (const path of ["/explorer", "/explorer/graphql"]) {
        const res = await fetch(`http://127.0.0.1:${port}${path}`);
        expect(res.status).toBe(200);
        expect(await res.text()).toBe("graphiql");
      }
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      );
    }
  });
});
