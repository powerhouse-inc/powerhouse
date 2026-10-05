// Worker isolation over real bundles: piece side-effects must stay in the
// child process. Requires dist/worker-entry.js (the test script builds first).
import http from "node:http";
import type { AddressInfo } from "node:net";
import {
  PieceWorker,
  PieceWorkerError,
  PieceWorkerTimeoutError,
} from "../../../src/pieces/activepieces/worker/host.js";
import { fetchBundleForTest } from "./bundle-cache.js";

const httpBundle = await fetchBundleForTest(
  "@activepieces/piece-http",
  "0.11.19",
);
const subflowsBundle = await fetchBundleForTest(
  "@activepieces/piece-subflows",
  "0.6.4",
);

function sendRequestProps(
  url: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    method: "GET",
    url,
    headers: {},
    queryParams: {},
    authType: "NONE",
    timeout: 10,
    failureMode: "continue_none",
    ...overrides,
  };
}

describe.skipIf(!httpBundle || !subflowsBundle)("PieceWorker", () => {
  let server: http.Server;
  let baseUrl: string;
  let worker: PieceWorker;

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      const url = new URL(req.url ?? "/", baseUrl);
      const respond = () => {
        res.writeHead(url.pathname === "/missing" ? 404 : 200, {
          "content-type": "application/json",
        });
        res.end(
          JSON.stringify({ query: Object.fromEntries(url.searchParams) }),
        );
      };
      if (url.pathname === "/slow") setTimeout(respond, 3_000);
      else respond();
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

  it("executes an action in the child and contains the TLS poisoning", async () => {
    expect(process.env.NODE_TLS_REJECT_UNAUTHORIZED).toBeUndefined();

    const result = await worker.runAction({
      bundleDir: httpBundle,
      actionName: "send_request",
      propsValue: sendRequestProps(`${baseUrl}/echo`, {
        queryParams: { spike: "worker" },
      }),
    });

    expect(result.output).toMatchObject({
      status: 200,
      body: { query: { spike: "worker" } },
    });
    expect(result.touched).toEqual(["propsValue"]);
    // The piece disabled TLS verification — in the child, not in this process.
    expect(result.tlsPoisoned).toBe(true);
    expect(process.env.NODE_TLS_REJECT_UNAUTHORIZED).toBeUndefined();
  });

  it("serializes piece errors across the boundary", async () => {
    const error: unknown = await worker
      .runAction({
        bundleDir: httpBundle,
        actionName: "send_request",
        propsValue: sendRequestProps(`${baseUrl}/missing`),
      })
      .then(
        () => undefined,
        (e: unknown) => e,
      );

    expect(error).toBeInstanceOf(PieceWorkerError);
    const serialized = (error as PieceWorkerError).serialized;
    expect(serialized.name).toBe("HttpError");
    expect(serialized.properties.status).toBe(404);
    expect(serialized.unsupportedMember).toBeUndefined();
  });

  it("reports unimplemented context members by full path", async () => {
    const error: unknown = await worker
      .runAction({
        bundleDir: subflowsBundle,
        actionName: "callFlow",
        propsValue: {
          flowId: "ext-1",
          mode: "simple",
          flowProps: {},
          waitForResponse: false,
        },
      })
      .then(
        () => undefined,
        (e: unknown) => e,
      );

    expect(error).toBeInstanceOf(PieceWorkerError);
    expect((error as PieceWorkerError).serialized.unsupportedMember).toBe(
      "flows.list",
    );
  });

  it("kills a hung action on timeout and replaces the worker", async () => {
    const error: unknown = await worker
      .runAction(
        {
          bundleDir: httpBundle,
          actionName: "send_request",
          propsValue: sendRequestProps(`${baseUrl}/slow`),
        },
        { timeoutMs: 500 },
      )
      .then(
        () => undefined,
        (e: unknown) => e,
      );
    expect(error).toBeInstanceOf(PieceWorkerTimeoutError);

    const result = await worker.runAction({
      bundleDir: httpBundle,
      actionName: "send_request",
      propsValue: sendRequestProps(`${baseUrl}/echo`),
    });
    expect(result.output).toMatchObject({ status: 200 });
  }, 15_000);
});

describe.skipIf(!subflowsBundle)("PieceWorker.resolveOptions", () => {
  it("resolves a DROPDOWN options() through the worker", async () => {
    const worker = new PieceWorker();
    try {
      const result = await worker.resolveOptions({
        bundleDir: subflowsBundle,
        actionName: "callFlow",
        propName: "flowId",
        refresherValues: {},
      });
      const output = result.output as {
        options: unknown[];
        disabled?: boolean;
      };
      expect(Array.isArray(output.options)).toBe(true);
      expect(output.options).toHaveLength(0);
    } finally {
      worker.dispose();
    }
  });
});
