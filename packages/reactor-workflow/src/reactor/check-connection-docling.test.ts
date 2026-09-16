// The docling piece's checkConnection shim through the real subgraph
// check-connection path: real PGlite secret store, real PieceWorker fork,
// built piece bundle, live mock docling-serve. The harness mirrors
// check-connection.test.ts (same mocks, same subgraph shape).
import { getDbClient, type BaseSubgraph } from "@powerhousedao/reactor-api";
import { ensurePieceBundle } from "../pieces/index.js";
import { createRelationalDb } from "@powerhousedao/shared/processors";
import type * as ReactorConnectors from "../pieces/index.js";
import type { Action, PHDocument } from "document-model";
import {
  actions,
  reducer,
  utils,
  type ConnectionAuthType,
  type ConnectionDocument,
  type RecordCheckResultInput,
} from "@powerhousedao/workflow/document-models/connection";
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("../pieces/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof ReactorConnectors>();
  return { ...actual, ensurePieceBundle: vi.fn() };
});

vi.mock("./piece-catalog.js", () => ({
  fetchPieceCatalog: vi.fn(),
  fetchPieceDetail: vi.fn(),
  fetchPieceActions: vi.fn(),
  fetchPieceTriggers: vi.fn(),
}));

import { fetchPieceCatalog } from "./piece-catalog.js";
import { workflowRuntime } from "./service.js";

const PIECE = { name: "@powerhousedao/piece-docling", version: "1.0.0" };
const FIXED_NOW = "2026-09-08T00:00:00.000Z";

// checkConnection demands a caller the subgraph can authorize.
const TEST_CTX = { headers: {}, db: {}, user: { address: "0xabc" } } as never;

// Minimal docling-serve: /health and /version open, /v1/* key-gated — the
// same route-level split as the real 1.32.0 (the connection check's
// key probe lands on a /v1/ route).
async function startMiniDocling(opts: { apiKey?: string }): Promise<{
  baseUrl: string;
  close(): Promise<void>;
}> {
  const server = http.createServer((req, res) => {
    const u = new URL(req.url ?? "/", "http://127.0.0.1");
    if (u.pathname === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify({ status: "ok" }));
    }
    if (u.pathname === "/version") {
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify({ "docling-serve": "1.32.0", docling: "2.126.0" }));
    }
    // Everything else (i.e. /v1/*) is gated.
    if (opts.apiKey && req.headers["x-api-key"] !== opts.apiKey) {
      res.writeHead(401, { "content-type": "application/json" });
      return res.end(JSON.stringify({ detail: "Invalid API Key." }));
    }
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ detail: "no route" }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      ),
  };
}

function seedBuiltBundle(cacheDir: string): void {
  const piecePkg = fileURLToPath(new URL("../../../piece-docling", import.meta.url));
  if (!existsSync(join(piecePkg, "dist/src/index.js"))) {
    execFileSync("node", ["scripts/bundle.mjs"], { cwd: piecePkg });
  }
  const dir = join(cacheDir, `${PIECE.name.replace("/", "-")}-${PIECE.version}`);
  mkdirSync(dir, { recursive: true });
  cpSync(join(piecePkg, "dist"), dir, { recursive: true });
}

let cacheDir = "";
let keyRef = "";
let wrongRef = "";
let get: Mock;
let execute: Mock;
let docling: Awaited<ReturnType<typeof startMiniDocling>>;

function makeDoclingDocument(options: {
  base_url: string;
  keyRef?: string;
}): ConnectionDocument {
  let document = utils.createDocument();
  document = reducer(
    document,
    actions.setConnector({
      connectorId: `${PIECE.name}#docling-serve`,
      authType: "CUSTOM_AUTH" as ConnectionAuthType,
    }),
  );
  document = reducer(
    document,
    actions.setConfig({ config: { base_url: options.base_url } }),
  );
  if (options.keyRef) {
    document = reducer(
      document,
      actions.setSecretRef({ id: "sr-1", name: "api_key", ref: options.keyRef }),
    );
  }
  document = reducer(
    document,
    actions.recordCheckResult({ status: "OK", checkedAt: FIXED_NOW }),
  );
  return document;
}

function lastRecordInput(): RecordCheckResultInput {
  const call = execute.mock.calls.at(-1);
  expect(call, "execute should have been called").toBeDefined();
  const actionList = call?.[2] as Action[];
  expect(actionList).toHaveLength(1);
  const action = actionList[0];
  expect(action.type).toBe("RECORD_CHECK_RESULT");
  return action.input as RecordCheckResultInput;
}

describe("WorkflowRuntimeService.checkConnection (docling piece)", () => {
  beforeAll(async () => {
    // Keep the key in-process so the encrypted store never writes a key file.
    process.env.PH_SECRETS_MASTER_KEY =
      "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08";
    cacheDir = await mkdtemp(join(tmpdir(), "ap-check-docling-"));
    seedBuiltBundle(cacheDir);

    vi.mocked(ensurePieceBundle).mockImplementation(
      ({ name, version, cacheDir: requestedCacheDir }) => {
        void requestedCacheDir;
        const dir = join(cacheDir, `${name.replace("/", "-")}-${version}`);
        if (!existsSync(join(dir, "package.json"))) {
          return Promise.reject(
            new Error(`Offline check test: no fixture bundle for ${name}@${version}`),
          );
        }
        return Promise.resolve({
          dir,
          source: "cache",
          dependencies: {},
          installed: false,
        });
      },
    );
    vi.mocked(fetchPieceCatalog).mockResolvedValue([
      {
        name: PIECE.name,
        displayName: "Docling",
        description: "",
        logoUrl: "",
        version: PIECE.version,
        actionCount: 6,
        triggerCount: 0,
        categories: [],
        auth: null,
      },
    ]);

    docling = await startMiniDocling({ apiKey: "k-docling" });
    // The mini server is on loopback, which the default policy denies — the
    // same allowance every other loopback suite here makes.
    (
      workflowRuntime as unknown as { designEgress?: unknown }
    ).designEgress = { allowAddresses: ["127.0.0.1/32", "::1/128"] };

    const { db } = getDbClient();
    get = vi.fn();
    execute = vi.fn(() => ({}) as PHDocument);
    const subgraph = {
      reactorClient: {
        get,
        execute,
        find: vi.fn(() => ({ results: [] })),
      },
      assertCanRead: vi.fn(() => Promise.resolve({})),
      relationalDb: createRelationalDb(db),
    } as unknown as BaseSubgraph;
    workflowRuntime.configure(subgraph);

    keyRef = (
      await (await workflowRuntime.secrets()).create({
        value: "k-docling",
        label: "docling api key",
      })
    ).ref;
    wrongRef = (
      await (await workflowRuntime.secrets()).create({
        value: "wrong-key",
        label: "docling api key (wrong)",
      })
    ).ref;
  });

  afterAll(async () => {
    await rm(cacheDir, { recursive: true, force: true });
    await docling.close();
  });

  it("records OK with the version-labelled account name for a healthy server", async () => {
    const document = makeDoclingDocument({ base_url: docling.baseUrl, keyRef });
    get.mockResolvedValueOnce(document);
    execute.mockClear();

    const result = await workflowRuntime.checkConnection(document.header.id, TEST_CTX);

    expect(result).toEqual({
      ok: true,
      detail: null,
      accountLabel: "docling-serve 1.32.0",
    });
    expect(lastRecordInput().status).toBe("OK");
  });

  it("records ERROR with the 401 detail for a rejected key", async () => {
    const document = makeDoclingDocument({ base_url: docling.baseUrl, keyRef: wrongRef });
    get.mockResolvedValueOnce(document);
    execute.mockClear();

    const result = await workflowRuntime.checkConnection(document.header.id, TEST_CTX);

    expect(result.ok).toBe(false);
    expect(result.detail).toMatch(/401/);
    expect(lastRecordInput().status).toBe("ERROR");
  });

  it("records ERROR when the server is unreachable", async () => {
    const document = makeDoclingDocument({ base_url: "http://127.0.0.1:1", keyRef });
    get.mockResolvedValueOnce(document);
    execute.mockClear();

    const result = await workflowRuntime.checkConnection(document.header.id, TEST_CTX);

    expect(result.ok).toBe(false);
    expect(result.detail).toMatch(/Could not reach/i);
    expect(lastRecordInput().status).toBe("ERROR");
  });
});
