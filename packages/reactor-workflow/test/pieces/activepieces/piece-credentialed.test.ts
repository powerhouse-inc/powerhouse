// P3: credentialed execution and stateful store over real bundles, through
// the worker. Auth values flow via ctx.auth; store persists across runs per scope.
import http from "node:http";
import type { AddressInfo } from "node:net";
import {
  buildActionContext,
  InMemoryConnectionsProvider,
} from "../../../src/pieces/activepieces/context/action.js";
import { PieceWorker } from "../../../src/pieces/activepieces/worker/host.js";
import { fetchBundleForTest } from "./bundle-cache.js";

const gotifyBundle = await fetchBundleForTest(
  "@activepieces/piece-gotify",
  "0.4.6",
);
const storeBundle = await fetchBundleForTest(
  "@activepieces/piece-store",
  "0.6.20",
);

interface SeenRequest {
  method: string;
  url: string;
  body: string;
}

describe.skipIf(!gotifyBundle || !storeBundle)(
  "credentialed pieces (P3)",
  () => {
    let server: http.Server;
    let baseUrl: string;
    let seen: SeenRequest[];
    let worker: PieceWorker;

    beforeAll(async () => {
      seen = [];
      server = http.createServer((req, res) => {
        let body = "";
        req.on("data", (chunk: Buffer) => (body += chunk.toString()));
        req.on("end", () => {
          seen.push({ method: req.method ?? "", url: req.url ?? "", body });
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({ id: 1 }));
        });
      });
      await new Promise<void>((resolve) =>
        server.listen(0, "127.0.0.1", resolve),
      );
      baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      worker = new PieceWorker();
    });

    afterAll(async () => {
      worker.dispose();
      await new Promise((resolve) => server.close(resolve));
    });

    it("executes a CUSTOM_AUTH action with the credential in ctx.auth", async () => {
      // CUSTOM_AUTH connection values are AppConnectionValue-shaped: props wrapped.
      const result = await worker.runAction({
        bundleDir: gotifyBundle,
        actionName: "send_notification",
        auth: {
          type: "CUSTOM_AUTH",
          props: { base_url: baseUrl, app_token: "spike-token" },
        },
        propsValue: { title: "Spike", message: "P3 credentialed run" },
      });

      expect(result.touched).toContain("auth");
      expect(seen).toHaveLength(1);
      expect(seen[0].method).toBe("POST");
      expect(seen[0].url).toContain("token=spike-token");
      expect(seen[0].body).toContain("P3 credentialed run");
    });

    it("persists store state across worker runs within a scope", async () => {
      const scope = "flow-run-1";
      await worker.runAction({
        bundleDir: storeBundle,
        actionName: "put",
        storeScope: scope,
        propsValue: {
          key: "greeting",
          value: "hello",
          store_scope: "COLLECTION",
        },
      });

      const sameScope = await worker.runAction({
        bundleDir: storeBundle,
        actionName: "get",
        storeScope: scope,
        propsValue: { key: "greeting", store_scope: "COLLECTION" },
      });
      expect(sameScope.output).toBe("hello");

      const otherScope = await worker.runAction({
        bundleDir: storeBundle,
        actionName: "get",
        storeScope: "flow-run-2",
        propsValue: {
          key: "greeting",
          defaultValue: "missing",
          store_scope: "COLLECTION",
        },
      });
      expect(otherScope.output).toBe("missing");
    });

    it("isolates piece-store scopes within one run scope", async () => {
      const scope = "flow-run-3";
      await worker.runAction({
        bundleDir: storeBundle,
        actionName: "put",
        storeScope: scope,
        propsValue: {
          key: "k",
          value: "collection",
          store_scope: "COLLECTION",
        },
      });
      const flowScoped = await worker.runAction({
        bundleDir: storeBundle,
        actionName: "get",
        storeScope: scope,
        propsValue: { key: "k", defaultValue: "unset", store_scope: "FLOW" },
      });
      expect(flowScoped.output).toBe("unset");
    });
  },
);

describe("connections channel", () => {
  it("serves injected connection values and null for unknown keys", async () => {
    const connections = new InMemoryConnectionsProvider({
      slack: { access_token: "xoxb" },
    });
    connections.set("gmail", { refresh_token: "r" });
    const { context } = buildActionContext({ propsValue: {}, connections });

    expect(await context.connections.get("slack")).toEqual({
      access_token: "xoxb",
    });
    expect(await context.connections.get("gmail")).toEqual({
      refresh_token: "r",
    });
    expect(await context.connections.get("unknown")).toBeNull();
  });
});
