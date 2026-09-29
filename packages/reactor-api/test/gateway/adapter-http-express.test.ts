import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { ExpressHttpAdapter } from "../../src/graphql/gateway/adapter-http-express.js";
import {
  runHttpAdapterContractTests,
  type HttpAdapterHarness,
} from "./http-adapter-contract.js";

// ─── Express harness factory ─────────────────────────────────────────────────

async function createExpressHarness(): Promise<HttpAdapterHarness> {
  const adapter = new ExpressHttpAdapter();
  adapter.setupMiddleware({});

  const httpServer = await adapter.listen(0, undefined, "127.0.0.1");
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

// ─── run the shared contract suite against ExpressHttpAdapter ────────────────

runHttpAdapterContractTests("ExpressHttpAdapter", createExpressHarness);

async function boundAddress(host?: string): Promise<string> {
  const adapter = new ExpressHttpAdapter();
  adapter.setupMiddleware({});
  const server = await adapter.listen(0, undefined, host);
  const { address } = server.address() as AddressInfo;
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
  return address;
}

describe("ExpressHttpAdapter.listen host", () => {
  it("binds the given host", async () => {
    expect(await boundAddress("127.0.0.1")).toBe("127.0.0.1");
  });

  it("binds the wildcard address without a host", async () => {
    expect(["::", "0.0.0.0"]).toContain(await boundAddress());
  });
});
