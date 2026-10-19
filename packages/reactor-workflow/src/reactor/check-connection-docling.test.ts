// The docling piece's auth hooks through the real check path: the built bundle
// as a package piece, a forked worker, a mini docling-serve, a real reactor.
import type { InProcessReactorClientModule } from "@powerhousedao/reactor";
import {
  actions,
  type ConnectionDocument,
} from "@powerhousedao/workflow/document-models/connection";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  connectionReactor,
  createDocument,
} from "../../test/helpers/connection-reactor.js";
import { testRuntime } from "../../test/helpers/runtime.js";
import { packagePieces } from "./piece-registry.js";
import type { WorkflowRuntimeService } from "./service.js";

const PIECE = { name: "@powerhousedao/piece-docling", version: "1.0.0" };
const FIXED_NOW = "2026-09-08T00:00:00.000Z";

// checkConnection demands a caller the subgraph can authorize.
const TEST_CTX = { headers: {}, db: {}, user: { address: "0xabc" } } as never;

// Minimal docling-serve: /health and /version open, /v1/* key-gated, the same
// split as the real 1.32.0 (the key probe lands on a /v1/ route).
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
      return res.end(
        JSON.stringify({ "docling-serve": "1.32.0", docling: "2.126.0" }),
      );
    }
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

// A separate package, not in this repo: the suite runs where it is checked out
// beside this one, and skips everywhere else.
const PIECE_PKG = fileURLToPath(
  new URL("../../../piece-docling", import.meta.url),
);
const PIECE_ENTRY = join(PIECE_PKG, "dist/node/pieces/docling/index.mjs");

let service: WorkflowRuntimeService;
let reactor: InProcessReactorClientModule;
let docling: Awaited<ReturnType<typeof startMiniDocling>>;
let keyRef = "";
let wrongRef = "";
let created = 0;

async function makeDoclingConnection(options: {
  base_url: string;
  keyRef: string;
}): Promise<string> {
  const id = `conn-docling-${++created}`;
  await createDocument(reactor, "connection", id, [
    actions.setConnector({
      connectorId: `${PIECE.name}#docling-serve`,
      authType: "CUSTOM_AUTH",
    }),
    actions.setConfig({ config: { base_url: options.base_url } }),
    actions.setSecretRef({ id: "sr-1", name: "api_key", ref: options.keyRef }),
    actions.recordCheckResult({ status: "OK", checkedAt: FIXED_NOW }),
  ]);
  return id;
}

const state = async (id: string) =>
  (await reactor.client.get<ConnectionDocument>(id)).state.global;

describe.skipIf(!existsSync(PIECE_PKG))(
  "WorkflowRuntimeService.checkConnection (docling piece)",
  () => {
    beforeAll(async () => {
      // Keep the key in-process so the encrypted store never writes a key file.
      process.env.PH_WORKFLOWS_SECRETS_MASTER_KEY =
        "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08";
      if (!existsSync(PIECE_ENTRY)) {
        execFileSync("pnpm", ["run", "build"], { cwd: PIECE_PKG });
      }
      // Installed as a package ships it: no catalog or download involved.
      packagePieces.setPieces([{ ...PIECE, entryPath: PIECE_ENTRY }]);

      docling = await startMiniDocling({ apiKey: "k-docling" });
      reactor = await connectionReactor();
      service = testRuntime({ reactorClient: reactor.client });

      // The mini server is on loopback, which the default policy denies.
      (service as unknown as { designEgress?: unknown }).designEgress = {
        allowAddresses: ["127.0.0.1/32", "::1/128"],
      };

      const secrets = await service.secrets();
      keyRef = (
        await secrets.create({ value: "k-docling", label: "docling api key" })
      ).ref;
      wrongRef = (
        await secrets.create({ value: "wrong-key", label: "docling (wrong)" })
      ).ref;
    });

    afterAll(async () => {
      packagePieces.reset();
      await docling.close();
      reactor.reactor.kill();
    });

    it("records OK with the version-labelled account name for a healthy server", async () => {
      const id = await makeDoclingConnection({
        base_url: docling.baseUrl,
        keyRef,
      });

      const result = await service.checkConnection(id, TEST_CTX);

      expect(result).toEqual({
        ok: true,
        detail: null,
        accountLabel: "docling-serve 1.32.0",
      });
      expect(await state(id)).toMatchObject({
        status: "OK",
        accountLabel: "docling-serve 1.32.0",
      });
    });

    it("records ERROR with the 401 detail for a rejected key", async () => {
      const id = await makeDoclingConnection({
        base_url: docling.baseUrl,
        keyRef: wrongRef,
      });

      const result = await service.checkConnection(id, TEST_CTX);

      expect(result.ok).toBe(false);
      expect(result.detail).toMatch(/401/);
      const after = await state(id);
      expect(after.status).toBe("ERROR");
      expect(after.lastError).toMatch(/401/);
    });

    it("records ERROR when the server is unreachable", async () => {
      const id = await makeDoclingConnection({
        base_url: "http://127.0.0.1:1",
        keyRef,
      });

      const result = await service.checkConnection(id, TEST_CTX);

      expect(result.ok).toBe(false);
      expect(result.detail).toMatch(/Could not reach/i);
      const after = await state(id);
      expect(after.status).toBe("ERROR");
      expect(after.lastError).toMatch(/Could not reach/i);
    });
  },
);
