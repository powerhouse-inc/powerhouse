import { FastifyHttpAdapter } from "../../src/graphql/gateway/adapter-http-fastify.js";
import {
  runRouteScopeTests,
  type ScopeHarness,
} from "./route-scope-contract.js";

async function createHarness(): Promise<ScopeHarness> {
  const adapter = new FastifyHttpAdapter();
  adapter.setupMiddleware({});
  const httpServer = await adapter.listen(0);
  const addr = httpServer.address() as { port: number };
  return {
    adapter,
    url: `http://127.0.0.1:${addr.port}`,
    close: () =>
      new Promise<void>((resolve, reject) =>
        httpServer.close((err) => (err ? reject(err) : resolve())),
      ),
  };
}

runRouteScopeTests("FastifyHttpAdapter", createHarness);
