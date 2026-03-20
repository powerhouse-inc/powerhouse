import express, { Router } from "express";
import { createServer } from "node:http";
import { ExpressHttpAdapter } from "../../src/graphql/gateway/express-http-adapter.js";
import {
  runHttpAdapterContractTests,
  type HttpAdapterHarness,
} from "./http-adapter-contract.js";

// ─── Express harness factory ─────────────────────────────────────────────────

async function createExpressHarness(): Promise<HttpAdapterHarness> {
  const app = express();
  const router = Router();
  const adapter = new ExpressHttpAdapter(router);
  adapter.setupMiddleware({});
  app.use("/", router);

  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address() as { port: number };

  return {
    adapter,
    url: `http://127.0.0.1:${addr.port}`,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      ),
    respondWithJson: (res, data) => {
      (res as express.Response).json(data);
    },
  };
}

// ─── run the shared contract suite against ExpressHttpAdapter ────────────────

runHttpAdapterContractTests("ExpressHttpAdapter", createExpressHarness);
