// E2E: the published-shape bundle, the real executor, the real worker, a
// mock docling-serve. This is the definition of "runs unmodified in the
// reactor" (doc 08).
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ActivepiecesBlockExecutor,
  StaticConnectionResolver,
  type SecretProvider,
} from "../../../src/pieces/index.js";
import { startMockDocling, MOCK_MD, type MockDocling } from "./mock-docling-serve.js";

const PIECE_PKG = path.resolve("../piece-docling");
const CACHE = path.join(tmpdir(), `docling-e2e-${process.pid}`);

function ensureBundleInCache(): void {
  if (!existsSync(path.join(PIECE_PKG, "dist/src/index.js"))) {
    execFileSync("node", ["scripts/bundle.mjs"], { cwd: PIECE_PKG });
  }
  const dir = path.join(CACHE, "@powerhousedao-piece-docling-1.0.0"); // fetch.ts cache layout
  mkdirSync(dir, { recursive: true });
  cpSync(path.join(PIECE_PKG, "dist"), dir, { recursive: true });
}

describe("docling piece through the executor (E2E)", () => {
  let mock: MockDocling;
  let executor: ActivepiecesBlockExecutor;
  const secrets: SecretProvider = {
    get: (ref: string) => Promise.resolve(ref === "secret://v1:docling" ? "k-e2e" : null),
  } as never;

  beforeAll(async () => {
    mock = await startMockDocling({ apiKey: "k-e2e" });
    ensureBundleInCache();
    executor = new ActivepiecesBlockExecutor({
      cacheDir: CACHE,
      // The mock service is on loopback, which the default policy refuses.
      egress: { allowAddresses: ["127.0.0.1/32", "::1/128"] },
      connections: new StaticConnectionResolver(
        {
          "phd:connection-1": {
            authType: "CUSTOM_AUTH",
            config: { base_url: mock.baseUrl },
            secretRefs: [{ name: "api_key", ref: "secret://v1:docling" }],
          },
        },
        secrets,
      ),
    });
  });
  afterAll(async () => {
    executor.dispose();
    await mock.close();
  });

  it("converts a data-URI file step and returns the markdown", async () => {
    const result = await executor.execute({
      blockType: "@powerhousedao/piece-docling@1.0.0#convert_file",
      connectionId: "phd:connection-1",
      config: {
        file: "data:application/pdf;base64," + Buffer.from("fake-pdf").toString("base64"),
        format: "markdown",
        ocr: true,
        table_mode: "accurate",
        image_mode: "placeholder",
        execution: "async",
        timeout_seconds: 30,
      },
      step: {
        id: "s1",
        key: "convert",
        name: "Convert",
        blockType: "@powerhousedao/piece-docling@1.0.0#convert_file",
        connectionId: "phd:connection-1",
        config: {},
      },
    });
    expect(result.output).toMatchObject({
      status: "success",
      document: { md_content: MOCK_MD },
    });
  });

  // v1 gates only the /v1/* routes; /health stays open, so a missing key
  // only fails on a real (gated) request. The executor surfaces the
  // piece's typed error across the IPC boundary.
  it("surfaces a connection auth failure as a typed error", async () => {
    const bad = new ActivepiecesBlockExecutor({
      cacheDir: CACHE,
      // The mock service is on loopback, which the default policy refuses.
      egress: { allowAddresses: ["127.0.0.1/32", "::1/128"] },
      connections: new StaticConnectionResolver(
        {
          "phd:bad": {
            authType: "CUSTOM_AUTH",
            config: { base_url: mock.baseUrl },
            secretRefs: [], // no key → 401 from the key-gated /v1 routes
          },
        },
        secrets,
      ),
    });
    try {
      await bad.execute({
        blockType: "@powerhousedao/piece-docling@1.0.0#convert_file",
        connectionId: "phd:bad",
        config: {
          file: "data:application/pdf;base64," + Buffer.from("fake-pdf").toString("base64"),
          ocr: false,
        },
        step: {
          id: "s2",
          key: "convert",
          name: "Convert",
          blockType: "@powerhousedao/piece-docling@1.0.0#convert_file",
          connectionId: "phd:bad",
          config: {},
        },
      });
      throw new Error("expected the action to fail");
    } catch (err) {
      // PieceWorkerError wraps the serialized piece error; the message
      // carries the DoclingError text.
      expect(String(err)).toMatch(/AUTH|401|API key/);
    } finally {
      bad.dispose();
    }
  });

  it("runs unauthenticated when the connection has no api_key secretRef", async () => {
    // spec §7.3: shapeAuthValue with no secretRefs must omit the key so the
    // piece talks to an unauthenticated server.
    const open = await startMockDocling(); // no key configured
    try {
      const resolver = new StaticConnectionResolver(
        { "phd:open": { authType: "CUSTOM_AUTH", config: { base_url: open.baseUrl } } },
        secrets,
      );
      const shaped = (await resolver.resolve("phd:open")) as {
        type: string;
        props: Record<string, unknown>;
      };
      expect(shaped).toMatchObject({
        type: "CUSTOM_AUTH",
        props: { base_url: open.baseUrl },
      });
      const unauth = new ActivepiecesBlockExecutor({
        cacheDir: CACHE,
        connections: resolver,
        egress: { allowAddresses: ["127.0.0.1/32", "::1/128"] },
      });
      const result = await unauth.execute({
        blockType: "@powerhousedao/piece-docling@1.0.0#health",
        connectionId: "phd:open",
        config: {},
        step: {
          id: "s3",
          key: "health",
          blockType: "@powerhousedao/piece-docling@1.0.0#health",
          connectionId: "phd:open",
          config: {},
        },
      });
      expect(result.output).toMatchObject({ status: "ok" });
      unauth.dispose();
    } finally {
      await open.close();
    }
  });
});
