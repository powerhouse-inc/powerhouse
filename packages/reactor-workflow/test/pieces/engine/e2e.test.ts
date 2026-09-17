// End-to-end skeleton run: trigger payload -> piece-http fetch -> core#branch
// -> gotify notification with a CUSTOM_AUTH connection, all via the worker.
import http from "node:http";
import type { AddressInfo } from "node:net";
import {
  ActivepiecesBlockExecutor,
  CompositeBlockExecutor,
} from "../../../src/pieces/engine/blocks.js";
import { StaticConnectionResolver } from "../../../src/pieces/engine/connections.js";
import { InMemorySecretProvider } from "../../../src/pieces/engine/secrets.js";
import { runWorkflow } from "../../../src/pieces/engine/coordinator.js";
import type { WorkflowDefinition } from "../../../src/pieces/engine/types.js";
import {
  bundleCacheDir,
  fetchBundleForTest,
} from "../activepieces/bundle-cache.js";

const httpBundle = await fetchBundleForTest(
  "@activepieces/piece-http",
  "0.11.19",
);
const gotifyBundle = await fetchBundleForTest(
  "@activepieces/piece-gotify",
  "0.4.6",
);

interface SeenRequest {
  method: string;
  url: string;
  body: string;
}

describe.skipIf(!httpBundle || !gotifyBundle)("workflow engine e2e", () => {
  let server: http.Server;
  let baseUrl: string;
  let seen: SeenRequest[];
  let executor: ActivepiecesBlockExecutor;

  beforeAll(async () => {
    seen = [];
    server = http.createServer((req, res) => {
      let body = "";
      req.on("data", (chunk: Buffer) => (body += chunk.toString()));
      req.on("end", () => {
        seen.push({ method: req.method ?? "", url: req.url ?? "", body });
        res.writeHead(200, { "content-type": "application/json" });
        if (req.url?.startsWith("/status")) {
          res.end(JSON.stringify({ ok: true, message: "disk almost full" }));
        } else {
          res.end(JSON.stringify({ id: 1 }));
        }
      });
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    executor = new ActivepiecesBlockExecutor({
      cacheDir: bundleCacheDir,
      // The mock service is on loopback, which the default policy refuses.
      egress: { allowAddresses: ["127.0.0.1/32", "::1/128"] },
      packages: {
        "@activepieces/piece-http": "0.11.19",
        "@activepieces/piece-gotify": "0.4.6",
      },
      connections: new StaticConnectionResolver(
        {
          "gotify-ops": {
            authType: "CUSTOM_AUTH",
            config: { base_url: baseUrl },
            secretRefs: [{ name: "app_token", ref: "vault://gotify" }],
          },
        },
        new InMemorySecretProvider({ "vault://gotify": "engine-token" }),
      ),
    });
  });

  afterAll(async () => {
    executor.dispose();
    await new Promise((resolve) => server.close(resolve));
  });

  function definition(): WorkflowDefinition {
    return {
      name: "Alert on status",
      trigger: { id: "t", blockType: "core#manual", config: {} },
      steps: [
        {
          id: "s1",
          key: "fetch",
          blockType: "@activepieces/piece-http#send_request",
          config: {
            method: "GET",
            url: "{{trigger.payload.statusUrl}}",
            headers: {},
            queryParams: {},
            authType: "NONE",
            timeout: 10,
            failureMode: "continue_none",
          },
        },
        {
          id: "s2",
          key: "check",
          blockType: "core#branch",
          config: { condition: "{{steps.fetch.output.body.ok}}" },
        },
        {
          id: "s3",
          key: "notify",
          blockType: "@activepieces/piece-gotify#send_notification",
          connectionId: "gotify-ops",
          config: {
            title: "Status alert",
            message: "Server says: {{steps.fetch.output.body.message}}",
          },
        },
        {
          id: "s4",
          key: "quiet",
          blockType: "@activepieces/piece-gotify#send_notification",
          connectionId: "gotify-ops",
          config: { title: "All clear", message: "nothing to report" },
        },
      ],
      edges: [
        { id: "e1", from: "t", to: "s1", port: "next" },
        { id: "e2", from: "s1", to: "s2", port: "next" },
        { id: "e3", from: "s2", to: "s3", port: "true" },
        { id: "e4", from: "s2", to: "s4", port: "false" },
      ],
    };
  }

  it("runs the full graph against real pieces", async () => {
    const run = await runWorkflow({
      definition: definition(),
      executor: new CompositeBlockExecutor(executor),
      triggerPayload: { statusUrl: `${baseUrl}/status` },
    });

    expect(run.status).toBe("SUCCEEDED");
    const byKey = Object.fromEntries(run.steps.map((s) => [s.key, s.status]));
    expect(byKey).toEqual({
      fetch: "SUCCEEDED",
      check: "SUCCEEDED",
      notify: "SUCCEEDED",
      quiet: "SKIPPED",
    });

    // First request: the status fetch. Second: the gotify POST with the
    // connection's token in the URL and the interpolated message in the body.
    expect(seen).toHaveLength(2);
    expect(seen[0].url).toBe("/status");
    expect(seen[1].method).toBe("POST");
    expect(seen[1].url).toContain("token=engine-token");
    expect(seen[1].body).toContain("Server says: disk almost full");
  }, 120_000);
});
