// checkConnection over offline fixture pieces: local bundle cache in the
// production layout, real PGlite-backed secret store, stubbed piece catalog.
import { getDbClient, type BaseSubgraph } from "@powerhousedao/reactor-api";
import {
  ensurePieceBundle,
  PieceWorkerTimeoutError,
  type PieceWorker,
} from "@powerhousedao/reactor-connectors";
import { createRelationalDb } from "@powerhousedao/shared/processors";
import type * as ReactorConnectors from "@powerhousedao/reactor-connectors";
import type { Action, PHDocument } from "document-model";
import {
  actions,
  reducer,
  utils,
  type ConnectionAuthType,
  type ConnectionDocument,
  type RecordCheckResultInput,
} from "document-models/connection/v1";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest";

// Bundle loads are redirected to a fixture cache (same layout as the real
// one) so no test ever reaches the Activepieces cloud.
vi.mock("@powerhousedao/reactor-connectors", async (importOriginal) => {
  const actual = await importOriginal<typeof ReactorConnectors>();
  return { ...actual, ensurePieceBundle: vi.fn() };
});

vi.mock("./piece-catalog.js", () => ({
  fetchPieceCatalog: vi.fn(),
  fetchPieceDetail: vi.fn(),
  fetchPieceActions: vi.fn(),
  fetchPieceTriggers: vi.fn(),
}));

import { fetchPieceCatalog, fetchPieceDetail } from "./piece-catalog.js";
import { BUNDLE_CACHE_DIR } from "./lib.js";
import { workflowRuntime } from "./service.js";

// checkConnection hands credentials to piece code, so it demands a caller the
// subgraph can authorize; the stub above allows this one.
const TEST_CTX = { headers: {}, db: {}, user: { address: "0xabc" } } as never;

const FIXED_NOW = "2026-09-04T00:00:00.000Z";
const MISSING_SECRET_REF = `secret://v1:${"0".repeat(32)}`;

const PIECES = {
  pass: { name: "@activepieces/piece-pass", version: "1.0.0" },
  fail: { name: "@activepieces/piece-fail", version: "1.0.0" },
  nocheck: { name: "@activepieces/piece-nocheck", version: "1.0.0" },
  denied: { name: "@activepieces/piece-denied", version: "1.0.0" },
  env: { name: "@activepieces/piece-env", version: "1.0.0" },
} as const;

const FIXTURE_BUNDLES: Record<keyof typeof PIECES, string> = {
  pass: `
const app = {
  displayName: "Pass Fixture",
  actions: {},
  checkConnection: async (ctx) => {
    if (!ctx.auth || ctx.auth.type !== "CUSTOM_AUTH") {
      throw new Error("fixture: unexpected auth shape");
    }
    if (ctx.auth.props.password !== "fixture-secret") {
      throw new Error("fixture: secret was not resolved");
    }
    if (Object.keys(ctx.propsValue).length !== 0) {
      throw new Error("fixture: propsValue must be empty");
    }
    return { name: "pass-account" };
  },
};
module.exports = { app };
`,
  fail: `
const app = {
  displayName: "Fail Fixture",
  actions: {},
  checkConnection: async () => {
    throw new Error("auth failed: bad credentials");
  },
};
module.exports = { app };
`,
  nocheck: `
const app = {
  displayName: "NoCheck Fixture",
  actions: {},
};
module.exports = { app };
`,
  denied: `
const app = {
  displayName: "Denied Fixture",
  actions: {},
  checkConnection: async () => false,
};
module.exports = { app };
`,
  env: `
const app = {
  displayName: "Env Fixture",
  actions: {},
  checkConnection: async () => ({
    name: process.env.PH_SECRETS_MASTER_KEY ? "leaked" : "isolated",
  }),
};
module.exports = { app };
`,
};

let cacheDir = "";
let passwordRef = "";
let get: Mock;
let execute: Mock;

function fixtureDir(piece: (typeof PIECES)[keyof typeof PIECES]): string {
  return join(cacheDir, `${piece.name.replace("/", "-")}-${piece.version}`);
}

async function writeFixtureBundle(
  piece: (typeof PIECES)[keyof typeof PIECES],
  code: string,
): Promise<void> {
  const dir = fixtureDir(piece);
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, "package.json"),
    JSON.stringify({
      name: piece.name,
      version: piece.version,
      main: "index.js",
    }),
  );
  await writeFile(join(dir, "index.js"), code);
}

function summary(name: string, version: string) {
  return {
    name,
    displayName: name,
    description: "",
    logoUrl: "",
    version,
    actionCount: 0,
    triggerCount: 0,
    categories: [],
    auth: null,
  };
}

function makeDocument(
  options: {
    connectorId?: string;
    authType?: ConnectionAuthType;
    secretRef?: string;
    // A real document only leaves UNCONFIGURED through a recorded check.
    configured?: boolean;
  } = {},
): ConnectionDocument {
  const {
    connectorId = `${PIECES.pass.name}#pass`,
    authType = "CUSTOM_AUTH",
    secretRef = passwordRef,
    configured = true,
  } = options;
  let document = utils.createDocument();
  document = reducer(document, actions.setConnector({ connectorId, authType }));
  document = reducer(
    document,
    actions.setConfig({ config: { host: "imap.example.com" } }),
  );
  if (secretRef) {
    document = reducer(
      document,
      actions.setSecretRef({ id: "sr-1", name: "password", ref: secretRef }),
    );
  }
  if (configured) {
    document = reducer(
      document,
      actions.recordCheckResult({ status: "OK", checkedAt: FIXED_NOW }),
    );
  }
  return document;
}

function lastRecordInput(): RecordCheckResultInput {
  const call = execute.mock.calls.at(-1);
  expect(call, "execute should have been called").toBeDefined();
  const actionList = call?.[2] as Action[];
  expect(actionList).toHaveLength(1);
  const action = actionList[0];
  expect(action.type).toBe("RECORD_CHECK_RESULT");
  expect(action.scope).toBe("global");
  return action.input as RecordCheckResultInput;
}

describe("WorkflowRuntimeService.checkConnection", () => {
  beforeAll(async () => {
    // Keep the key in-process so the encrypted store never writes a key file.
    process.env.PH_SECRETS_MASTER_KEY =
      "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08";
    cacheDir = await mkdtemp(join(tmpdir(), "ap-check-connection-"));
    for (const key of Object.keys(PIECES) as Array<keyof typeof PIECES>) {
      await writeFixtureBundle(PIECES[key], FIXTURE_BUNDLES[key]);
    }

    vi.mocked(ensurePieceBundle).mockImplementation(
      ({ name, version, cacheDir: requestedCacheDir }) => {
        void requestedCacheDir;
        const dir = join(cacheDir, `${name.replace("/", "-")}-${version}`);
        if (!existsSync(join(dir, "package.json"))) {
          return Promise.reject(
            new Error(
              `Offline check test: no fixture bundle for ${name}@${version}`,
            ),
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
    vi.mocked(fetchPieceCatalog).mockResolvedValue(
      Object.values(PIECES).map((piece) => summary(piece.name, piece.version)),
    );
    vi.mocked(fetchPieceDetail).mockResolvedValue({ version: "1.0.0" });

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

    const created = await (
      await workflowRuntime.secrets()
    ).create({
      value: "fixture-secret",
      label: "password",
    });
    passwordRef = created.ref;
  });

  afterAll(async () => {
    await rm(cacheDir, { recursive: true, force: true });
  });

  it("runs a passing check and records OK with the account label", async () => {
    const document = makeDocument();
    get.mockResolvedValueOnce(document);
    execute.mockClear();

    const result = await workflowRuntime.checkConnection(document.header.id, TEST_CTX);

    expect(result).toEqual({
      ok: true,
      detail: null,
      accountLabel: "pass-account",
    });
    expect(ensurePieceBundle).toHaveBeenCalledWith({
      name: PIECES.pass.name,
      version: PIECES.pass.version,
      cacheDir: BUNDLE_CACHE_DIR,
    });
    const input = lastRecordInput();
    expect(input.status).toBe("OK");
    expect(input.checkedAt).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    );
    expect(input.error).toBeUndefined();
    expect(execute).toHaveBeenCalledWith(document.header.id, "main", [
      expect.objectContaining({ type: "RECORD_CHECK_RESULT" }),
    ]);
  });

  it("records ERROR with the failure detail when the check throws", async () => {
    const document = makeDocument({
      connectorId: `${PIECES.fail.name}#fail`,
    });
    get.mockResolvedValueOnce(document);
    execute.mockClear();

    const result = await workflowRuntime.checkConnection(document.header.id, TEST_CTX);

    expect(result.ok).toBe(false);
    expect(result.detail).toBe("auth failed: bad credentials");
    const input = lastRecordInput();
    expect(input.status).toBe("ERROR");
    expect(typeof input.checkedAt).toBe("string");
    expect(input.error).toBe("auth failed: bad credentials");
  });

  // The check must not see the reactor's own environment; a fixture that reads
  // the master key would report "leaked" if it ran in this process.
  it("runs the check outside the reactor process", async () => {
    const document = makeDocument({
      connectorId: `${PIECES.env.name}#env`,
    });
    get.mockResolvedValueOnce(document);
    execute.mockClear();

    const result = await workflowRuntime.checkConnection(document.header.id, TEST_CTX);

    expect(result).toEqual({
      ok: true,
      detail: null,
      accountLabel: "isolated",
    });
    expect(lastRecordInput().status).toBe("OK");
  });

  it("records ERROR when the check returns false", async () => {
    const document = makeDocument({
      connectorId: `${PIECES.denied.name}#denied`,
    });
    get.mockResolvedValueOnce(document);
    execute.mockClear();

    const result = await workflowRuntime.checkConnection(document.header.id, TEST_CTX);

    expect(result).toEqual({
      ok: false,
      detail: "Connection check failed",
      accountLabel: null,
    });
    expect(lastRecordInput()).toMatchObject({
      status: "ERROR",
      error: "Connection check failed",
    });
  });

  // The worker's own timeout handling is covered in reactor-connectors; here
  // only the mapping onto the mutation's wording, without waiting it out.
  it("records ERROR when the worker times the check out", async () => {
    const runtime = workflowRuntime as unknown as {
      designWorker?: Pick<PieceWorker, "checkConnection">;
    };
    const previous = runtime.designWorker;
    runtime.designWorker = {
      checkConnection: () => Promise.reject(new PieceWorkerTimeoutError(30_000)),
    };
    const document = makeDocument();
    get.mockResolvedValueOnce(document);
    execute.mockClear();
    try {
      const result = await workflowRuntime.checkConnection(document.header.id, TEST_CTX);

      expect(result).toEqual({
        ok: false,
        detail: "Connection check timed out after 30s",
        accountLabel: null,
      });
      expect(lastRecordInput()).toMatchObject({
        status: "ERROR",
        error: "Connection check timed out after 30s",
      });
    } finally {
      runtime.designWorker = previous;
    }
  });

  it("reports resolved credentials when the piece declares no check", async () => {
    const document = makeDocument({
      connectorId: `${PIECES.nocheck.name}#nocheck`,
    });
    get.mockResolvedValueOnce(document);
    execute.mockClear();

    const result = await workflowRuntime.checkConnection(document.header.id, TEST_CTX);

    expect(result).toEqual({
      ok: true,
      detail: "piece declares no connection check; credentials resolved",
      accountLabel: null,
    });
    const input = lastRecordInput();
    expect(input.status).toBe("OK");
    expect(input.error).toBeUndefined();
  });

  it("surfaces a missing secret by naming its ref", async () => {
    const document = makeDocument({ secretRef: MISSING_SECRET_REF });
    get.mockResolvedValueOnce(document);
    execute.mockClear();

    const result = await workflowRuntime.checkConnection(document.header.id, TEST_CTX);

    expect(result.ok).toBe(false);
    expect(result.detail).toContain(MISSING_SECRET_REF);
    const input = lastRecordInput();
    expect(input.status).toBe("ERROR");
    expect(input.error).toBe(`No secret found for ref "${MISSING_SECRET_REF}"`);
  });

  it("refuses OAUTH2 without fetching a bundle", async () => {
    const document = makeDocument({ authType: "OAUTH2" });
    get.mockResolvedValueOnce(document);
    vi.mocked(ensurePieceBundle).mockClear();
    execute.mockClear();

    const result = await workflowRuntime.checkConnection(document.header.id, TEST_CTX);

    expect(result).toEqual({
      ok: false,
      detail: "OAUTH2 connections are not supported by the runtime yet",
      accountLabel: null,
    });
    expect(ensurePieceBundle).not.toHaveBeenCalled();
    expect(lastRecordInput()).toMatchObject({
      status: "ERROR",
      error: "OAUTH2 connections are not supported by the runtime yet",
    });
  });

  it("refuses an unconfigured connection without fetching a bundle", async () => {
    const document = makeDocument({ configured: false });
    get.mockResolvedValueOnce(document);
    vi.mocked(ensurePieceBundle).mockClear();
    execute.mockClear();

    const result = await workflowRuntime.checkConnection(document.header.id, TEST_CTX);

    expect(result).toEqual({
      ok: false,
      detail: "Connection is not configured",
      accountLabel: null,
    });
    expect(ensurePieceBundle).not.toHaveBeenCalled();
    expect(lastRecordInput()).toMatchObject({
      status: "ERROR",
      error: "Connection is not configured",
    });
  });

  it("refuses a revoked connection instead of resolving its secrets", async () => {
    let document = makeDocument();
    document = reducer(
      document,
      actions.recordCheckResult({ status: "REVOKED", checkedAt: FIXED_NOW }),
    );
    get.mockResolvedValueOnce(document);
    execute.mockClear();

    const result = await workflowRuntime.checkConnection(
      document.header.id,
      TEST_CTX,
    );

    expect(result.ok).toBe(false);
    expect(result.detail).toContain("revoked");
    // Recording any result would write ERROR over REVOKED, which is what the
    // second check below would then walk through.
    expect(execute).not.toHaveBeenCalled();
  });

  it("keeps refusing a revoked connection on a second check", async () => {
    let document = reducer(
      makeDocument(),
      actions.recordCheckResult({ status: "REVOKED", checkedAt: FIXED_NOW }),
    );
    // Writes land on the document the next read returns, so a recorded ERROR
    // would clear REVOKED exactly as it does against a real reactor.
    get.mockImplementation(() => Promise.resolve(document));
    execute.mockImplementation((_id, _scope, actionList: Action[]) => {
      document = reducer(document, actionList[0]);
      return document;
    });
    vi.mocked(ensurePieceBundle).mockClear();

    await workflowRuntime.checkConnection(document.header.id, TEST_CTX);
    const second = await workflowRuntime.checkConnection(
      document.header.id,
      TEST_CTX,
    );

    expect(second.ok).toBe(false);
    expect(second.detail).toContain("revoked");
    expect(document.state.global.status).toBe("REVOKED");
    // Nothing reached the piece, so nothing shaped the stored secrets.
    expect(ensurePieceBundle).not.toHaveBeenCalled();
  });

  it("refuses a caller the subgraph cannot identify", async () => {
    const document = makeDocument();
    get.mockResolvedValueOnce(document);

    await expect(
      workflowRuntime.checkConnection(document.header.id),
    ).rejects.toThrow("authenticated request");
  });

  it("resolves the version from piece detail when the catalog misses", async () => {
    vi.mocked(fetchPieceCatalog).mockResolvedValueOnce([]);
    vi.mocked(fetchPieceDetail).mockClear();
    const document = makeDocument();
    get.mockResolvedValueOnce(document);

    const result = await workflowRuntime.checkConnection(document.header.id, TEST_CTX);

    expect(result.ok).toBe(true);
    expect(fetchPieceDetail).toHaveBeenCalledWith(PIECES.pass.name);
    expect(ensurePieceBundle).toHaveBeenCalledWith({
      name: PIECES.pass.name,
      version: "1.0.0",
      cacheDir: BUNDLE_CACHE_DIR,
    });
  });
});
