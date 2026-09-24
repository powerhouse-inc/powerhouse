// checkConnection over offline fixture pieces: local bundle cache in the
// production layout, real PGlite-backed secret store, stubbed piece catalog.
import { createTestRelationalDb } from "../../test/helpers/pglite.js";
import type { WorkflowRuntimeHostDeps } from "./host.js";
import {
  DEFAULT_EGRESS_POLICY,
  ensurePieceBundle,
  PieceWorkerTimeoutError,
  type PieceWorker,
} from "../pieces/index.js";
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

import { fetchPieceCatalog, fetchPieceDetail } from "./piece-catalog.js";
import { BUNDLE_CACHE_DIR } from "./lib.js";
import type { WorkflowRuntimeService } from "./service.js";
import { testRuntime } from "../../test/helpers/runtime.js";

let service: WorkflowRuntimeService;

// checkConnection hands credentials to piece code, so it demands a caller the
// subgraph can authorize; the stub above allows this one.
const TEST_CTX = { headers: {}, db: {}, user: { address: "0xabc" } } as never;

const FIXED_NOW = "2026-09-04T00:00:00.000Z";
const MISSING_SECRET_REF = `secret://v1:${"0".repeat(32)}`;

const PIECES = {
  pass: { name: "@activepieces/piece-pass", version: "1.0.0" },
  fail: { name: "@activepieces/piece-fail", version: "1.0.0" },
  nocheck: { name: "@activepieces/piece-nocheck", version: "1.0.0" },
  validates: { name: "@activepieces/piece-validates", version: "1.0.0" },
  refuses: { name: "@activepieces/piece-refuses", version: "1.0.0" },
  denied: { name: "@activepieces/piece-denied", version: "1.0.0" },
  env: { name: "@activepieces/piece-env", version: "1.0.0" },
  labelThrows: { name: "@activepieces/piece-label-throws", version: "1.0.0" },
} as const;

const FIXTURE_BUNDLES: Record<keyof typeof PIECES, string> = {
  pass: `
const app = {
  displayName: "Pass Fixture",
  actions: {},
  auth: {
    type: "CUSTOM_AUTH",
    validate: async (ctx) => {
      if (ctx.auth.password !== "fixture-secret") {
        throw new Error("fixture: secret was not resolved");
      }
      if (Object.keys(ctx).sort().join(",") !== "auth,server") {
        throw new Error("fixture: validate receives auth and server only");
      }
      return { valid: true };
    },
    getConnectionIdentifier: async ({ auth }) => "pass-account @ " + auth.host,
  },
};
module.exports = { app };
`,
  fail: `
const app = {
  displayName: "Fail Fixture",
  actions: {},
  auth: {
    type: "CUSTOM_AUTH",
    validate: async () => {
      throw new Error("auth failed: bad credentials");
    },
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
  validates: `
const app = {
  displayName: "Validates Fixture",
  actions: {},
  auth: {
    type: "CUSTOM_AUTH",
    // Upstream hands validate the property values, so a piece written against
    // the Activepieces docs reads them flat.
    validate: async ({ auth }) => ({ valid: auth.host === "imap.example.com" }),
  },
};
module.exports = { app };
`,
  refuses: `
const app = {
  displayName: "Refuses Fixture",
  actions: {},
  auth: {
    type: "CUSTOM_AUTH",
    validate: async () => ({ valid: false, error: "that host refused the login" }),
  },
};
module.exports = { app };
`,
  denied: `
const app = {
  displayName: "Denied Fixture",
  actions: {},
  auth: { type: "CUSTOM_AUTH", validate: async () => ({ valid: false }) },
};
module.exports = { app };
`,
  env: `
const app = {
  displayName: "Env Fixture",
  actions: {},
  auth: {
    type: "CUSTOM_AUTH",
    validate: async () => ({ valid: true }),
    getConnectionIdentifier: async () =>
      process.env.PH_WORKFLOWS_SECRETS_MASTER_KEY ? "leaked" : "isolated",
  },
};
module.exports = { app };
`,
  labelThrows: `
const app = {
  displayName: "Label Throws Fixture",
  actions: {},
  auth: {
    type: "CUSTOM_AUTH",
    validate: async () => ({ valid: true }),
    getConnectionIdentifier: async () => {
      throw new Error("whoami answered 500");
    },
  },
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
    // Nothing to authenticate with: no config values and no secret handles.
    empty?: boolean;
  } = {},
): ConnectionDocument {
  const {
    connectorId = `${PIECES.pass.name}#pass`,
    authType = "CUSTOM_AUTH",
    secretRef = passwordRef,
    configured = true,
    empty = false,
  } = options;
  let document = utils.createDocument();
  document = reducer(document, actions.setConnector({ connectorId, authType }));
  if (!empty) {
    document = reducer(
      document,
      actions.setConfig({ config: { host: "imap.example.com" } }),
    );
  }
  if (secretRef && !empty) {
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

function lastActions(): Action[] {
  const call = execute.mock.calls.at(-1);
  expect(call, "execute should have been called").toBeDefined();
  return call?.[2] as Action[];
}

function lastRecordInput(): RecordCheckResultInput {
  const action = lastActions()[0];
  expect(action.type).toBe("RECORD_CHECK_RESULT");
  expect(action.scope).toBe("global");
  return action.input as RecordCheckResultInput;
}

// The SET_ACCOUNT_LABEL the last check wrote, if any.
function lastLabelWritten(): string | null | undefined {
  const action = lastActions().find((a) => a.type === "SET_ACCOUNT_LABEL");
  return (action?.input as { accountLabel?: string | null } | undefined)
    ?.accountLabel;
}

describe("WorkflowRuntimeService.checkConnection", () => {
  beforeAll(async () => {
    // Keep the key in-process so the encrypted store never writes a key file.
    process.env.PH_WORKFLOWS_SECRETS_MASTER_KEY =
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
          source: "cache" as const,
          dependencies: {},
          installed: false,
        });
      },
    );
    vi.mocked(fetchPieceCatalog).mockResolvedValue(
      Object.values(PIECES).map((piece) => summary(piece.name, piece.version)),
    );
    vi.mocked(fetchPieceDetail).mockResolvedValue({ version: "1.0.0" });

    get = vi.fn();
    execute = vi.fn(() => ({}) as PHDocument);
    service = testRuntime({
      reactorClient: {
        get,
        execute,
        find: vi.fn(() => ({ results: [] })),
      },
      assertCanRead: vi.fn(() => Promise.resolve({})),
      relationalDb: createTestRelationalDb(),
    } as unknown as WorkflowRuntimeHostDeps);

    const created = await (
      await service.secrets()
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

    const result = await service.checkConnection(document.header.id, TEST_CTX);

    expect(result).toEqual({
      ok: true,
      detail: null,
      accountLabel: "pass-account @ imap.example.com",
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
    expect(lastLabelWritten()).toBe("pass-account @ imap.example.com");
  });

  it("writes no label that the connection already holds", async () => {
    const document = reducer(
      makeDocument(),
      actions.setAccountLabel({
        accountLabel: "pass-account @ imap.example.com",
      }),
    );
    get.mockResolvedValueOnce(document);
    execute.mockClear();

    const result = await service.checkConnection(document.header.id, TEST_CTX);

    expect(result.accountLabel).toBe("pass-account @ imap.example.com");
    expect(lastActions()).toHaveLength(1);
  });

  it("passes the check and keeps the previous label when labelling throws", async () => {
    const document = reducer(
      makeDocument({ connectorId: `${PIECES.labelThrows.name}#labelThrows` }),
      actions.setAccountLabel({ accountLabel: "ops@example.com" }),
    );
    get.mockResolvedValueOnce(document);
    execute.mockClear();

    const result = await service.checkConnection(document.header.id, TEST_CTX);

    expect(result).toEqual({
      ok: true,
      detail: null,
      accountLabel: "ops@example.com",
    });
    expect(lastRecordInput().status).toBe("OK");
    expect(lastLabelWritten()).toBeUndefined();
  });

  it("records ERROR with the failure detail when the check throws", async () => {
    const document = makeDocument({
      connectorId: `${PIECES.fail.name}#fail`,
    });
    get.mockResolvedValueOnce(document);
    execute.mockClear();

    const result = await service.checkConnection(document.header.id, TEST_CTX);

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

    const result = await service.checkConnection(document.header.id, TEST_CTX);

    expect(result).toEqual({
      ok: true,
      detail: null,
      accountLabel: "isolated",
    });
    expect(lastRecordInput().status).toBe("OK");
  });

  it("records ERROR when validate refuses without a reason", async () => {
    const document = makeDocument({
      connectorId: `${PIECES.denied.name}#denied`,
    });
    get.mockResolvedValueOnce(document);
    execute.mockClear();

    const result = await service.checkConnection(document.header.id, TEST_CTX);

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

  // The worker's own timeout handling is covered in src/pieces; here
  // only the mapping onto the mutation's wording, without waiting it out.
  it("records ERROR when the worker times the check out", async () => {
    const runtime = service as unknown as {
      designWorker?: Pick<PieceWorker, "checkConnection">;
    };
    const previous = runtime.designWorker;
    runtime.designWorker = {
      checkConnection: () =>
        Promise.reject(new PieceWorkerTimeoutError(30_000)),
    };
    const document = makeDocument();
    get.mockResolvedValueOnce(document);
    execute.mockClear();
    try {
      const result = await service.checkConnection(
        document.header.id,
        TEST_CTX,
      );

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

  // A check is piece code holding live credentials; it runs under the policy
  // the run will, so it cannot reach anywhere a step could not.
  it("runs the check under the same egress policy a run gets", async () => {
    const runtime = service as unknown as {
      designWorker?: Pick<PieceWorker, "checkConnection">;
    };
    const previous = runtime.designWorker;
    let request: { egress?: unknown } | undefined;
    runtime.designWorker = {
      checkConnection: (sent) => {
        request = sent;
        return Promise.resolve({
          output: { declared: false, valid: true },
          touched: [],
          tlsPoisoned: false,
        });
      },
    };
    const document = makeDocument();
    get.mockResolvedValueOnce(document);
    execute.mockClear();
    try {
      await service.checkConnection(document.header.id, TEST_CTX);

      expect(request?.egress).toEqual(DEFAULT_EGRESS_POLICY);
    } finally {
      runtime.designWorker = previous;
    }
  });

  it("reports resolved credentials when the piece declares no validate", async () => {
    const document = makeDocument({
      connectorId: `${PIECES.nocheck.name}#nocheck`,
    });
    get.mockResolvedValueOnce(document);
    execute.mockClear();

    const result = await service.checkConnection(document.header.id, TEST_CTX);

    expect(result).toEqual({
      ok: true,
      detail: "piece declares no auth.validate; credentials resolved",
      accountLabel: null,
    });
    const input = lastRecordInput();
    expect(input.status).toBe("OK");
    expect(input.error).toBeUndefined();
  });

  it("hands validate the property values flat", async () => {
    const document = makeDocument({
      connectorId: `${PIECES.validates.name}#validates`,
    });
    get.mockResolvedValueOnce(document);
    execute.mockClear();

    const result = await service.checkConnection(document.header.id, TEST_CTX);

    expect(result.ok).toBe(true);
    // Not the "declares no auth.validate" answer: a check really ran, and it
    // read the property values, which only the unwrapped form carries.
    expect(result.detail).toBeNull();
    expect(lastRecordInput().status).toBe("OK");
  });

  it("reports the reason validate gave for refusing", async () => {
    const document = makeDocument({
      connectorId: `${PIECES.refuses.name}#refuses`,
    });
    get.mockResolvedValueOnce(document);
    execute.mockClear();

    const result = await service.checkConnection(document.header.id, TEST_CTX);

    expect(result).toMatchObject({
      ok: false,
      detail: "that host refused the login",
    });
    expect(lastRecordInput().status).toBe("ERROR");
  });

  it("surfaces a missing secret by naming its ref", async () => {
    const document = makeDocument({ secretRef: MISSING_SECRET_REF });
    get.mockResolvedValueOnce(document);
    execute.mockClear();

    const result = await service.checkConnection(document.header.id, TEST_CTX);

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

    const result = await service.checkConnection(document.header.id, TEST_CTX);

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

  it("refuses a connection with nothing to authenticate with, without fetching a bundle", async () => {
    const document = makeDocument({ configured: false, empty: true });
    get.mockResolvedValueOnce(document);
    vi.mocked(ensurePieceBundle).mockClear();
    execute.mockClear();

    const result = await service.checkConnection(document.header.id, TEST_CTX);

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

  // SET_CONNECTOR leaves UNCONFIGURED behind and only a recorded check clears
  // it, so a status-based guard refused the very first check of every
  // connection — the one an author runs after filling the form in.
  it("checks a configured connection that has never been checked", async () => {
    const document = makeDocument({ configured: false });
    get.mockResolvedValueOnce(document);
    execute.mockClear();

    const result = await service.checkConnection(document.header.id, TEST_CTX);

    expect(result.ok).toBe(true);
    expect(lastRecordInput()).toMatchObject({ status: "OK" });
  });

  it("refuses a revoked connection instead of resolving its secrets", async () => {
    let document = makeDocument();
    document = reducer(
      document,
      actions.recordCheckResult({ status: "REVOKED", checkedAt: FIXED_NOW }),
    );
    get.mockResolvedValueOnce(document);
    execute.mockClear();

    const result = await service.checkConnection(document.header.id, TEST_CTX);

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

    await service.checkConnection(document.header.id, TEST_CTX);
    const second = await service.checkConnection(document.header.id, TEST_CTX);

    expect(second.ok).toBe(false);
    expect(second.detail).toContain("revoked");
    expect(document.state.global.status).toBe("REVOKED");
    // Nothing reached the piece, so nothing shaped the stored secrets.
    expect(ensurePieceBundle).not.toHaveBeenCalled();
  });

  it("refuses a caller the subgraph cannot identify", async () => {
    const document = makeDocument();
    get.mockResolvedValueOnce(document);

    await expect(service.checkConnection(document.header.id)).rejects.toThrow(
      "authenticated request",
    );
  });

  it("resolves the version from piece detail when the catalog misses", async () => {
    vi.mocked(fetchPieceCatalog).mockResolvedValueOnce([]);
    vi.mocked(fetchPieceDetail).mockClear();
    const document = makeDocument();
    get.mockResolvedValueOnce(document);

    const result = await service.checkConnection(document.header.id, TEST_CTX);

    expect(result.ok).toBe(true);
    expect(fetchPieceDetail).toHaveBeenCalledWith(PIECES.pass.name);
    expect(ensurePieceBundle).toHaveBeenCalledWith({
      name: PIECES.pass.name,
      version: "1.0.0",
      cacheDir: BUNDLE_CACHE_DIR,
    });
  });
});
