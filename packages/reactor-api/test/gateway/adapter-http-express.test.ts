import express from "express";
import { ExpressHttpAdapter } from "../../src/graphql/gateway/adapter-http-express.js";
import {
  runHttpAdapterContractTests,
  type HttpAdapterHarness,
} from "./http-adapter-contract.js";

// ─── Express harness factory ─────────────────────────────────────────────────

async function createExpressHarness(): Promise<HttpAdapterHarness> {
  const app = express();
  const adapter = new ExpressHttpAdapter(app);
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
    respondWithJson: (res, data) => {
      (res as express.Response).json(data);
    },
  };
}

// ─── run the shared contract suite against ExpressHttpAdapter ────────────────

runHttpAdapterContractTests("ExpressHttpAdapter", createExpressHarness);
