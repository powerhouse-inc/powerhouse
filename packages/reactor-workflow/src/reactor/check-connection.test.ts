// checkConnection over fixture pieces served by a local npm and CDN, a real
// PGlite-backed secret store and an in-process reactor holding the connections.
import type { InProcessReactorClientModule } from "@powerhousedao/reactor";
import {
  actions,
  type ConnectionAuthType,
  type ConnectionDocument,
} from "@powerhousedao/workflow/document-models/connection";
import type { Action } from "document-model";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  connectionReactor,
  createDocument,
} from "../../test/helpers/connection-reactor.js";
import {
  startPieceSources,
  type PieceSources,
} from "../../test/helpers/piece-sources.js";
import { testRuntime } from "../../test/helpers/runtime.js";
import {
  DEFAULT_EGRESS_POLICY,
  PieceWorkerTimeoutError,
  type PieceWorker,
} from "../pieces/index.js";
import type { WorkflowRuntimeService } from "./service.js";

let service: WorkflowRuntimeService;
let reactor: InProcessReactorClientModule;

// checkConnection hands credentials to piece code, so it demands a caller.
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

let sources: PieceSources;
let passwordRef = "";
let created = 0;

const bundleRequests = () =>
  sources.requests.filter((path) => path.endsWith(".tgz"));

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

// A connection in the reactor; `extra` lands after the setup actions.
async function makeConnection(
  options: {
    connectorId?: string;
    authType?: ConnectionAuthType;
    secretRef?: string;
    // A real document only leaves UNCONFIGURED through a recorded check.
    configured?: boolean;
    // Nothing to authenticate with: no config values and no secret handles.
    empty?: boolean;
    extra?: Action[];
  } = {},
): Promise<string> {
  const {
    connectorId = `${PIECES.pass.name}#pass`,
    authType = "CUSTOM_AUTH",
    secretRef = passwordRef,
    configured = true,
    empty = false,
    extra = [],
  } = options;
  const list: Action[] = [actions.setConnector({ connectorId, authType })];
  if (!empty) {
    list.push(actions.setConfig({ config: { host: "imap.example.com" } }));
    if (secretRef) {
      list.push(
        actions.setSecretRef({ id: "sr-1", name: "password", ref: secretRef }),
      );
    }
  }
  if (configured) {
    list.push(
      actions.recordCheckResult({ status: "OK", checkedAt: FIXED_NOW }),
    );
  }
  list.push(...extra);
  const id = `conn-check-${++created}`;
  await createDocument(reactor, "connection", id, list);
  return id;
}

const stored = (id: string) => reactor.client.get<ConnectionDocument>(id);
const state = async (id: string) => (await stored(id)).state.global;
const operationTypes = async (id: string) =>
  (await reactor.client.getOperations(id, { scopes: ["global"] })).results.map(
    (op) => op.action.type,
  );

describe("WorkflowRuntimeService.checkConnection", () => {
  beforeAll(async () => {
    // Keep the key in-process so the encrypted store never writes a key file.
    process.env.PH_WORKFLOWS_SECRETS_MASTER_KEY =
      "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08";
    sources = await startPieceSources({
      npm: (Object.keys(PIECES) as Array<keyof typeof PIECES>).map((key) => ({
        ...PIECES[key],
        code: FIXTURE_BUNDLES[key],
      })),
    });
    reactor = await connectionReactor();
    service = testRuntime({ reactorClient: reactor.client });

    passwordRef = (
      await (
        await service.secrets()
      ).create({ value: "fixture-secret", label: "password" })
    ).ref;
  });

  afterAll(async () => {
    await sources.stop();
    reactor.reactor.kill();
  });

  it("runs a passing check and records OK with the account label", async () => {
    const id = await makeConnection();

    const result = await service.checkConnection(id, TEST_CTX);

    expect(result).toEqual({
      ok: true,
      detail: null,
      accountLabel: "pass-account @ imap.example.com",
    });
    expect(sources.requests).toContain(
      `/npm/${PIECES.pass.name.replace("/", "%2f")}`,
    );
    const after = await state(id);
    expect(after).toMatchObject({
      status: "OK",
      lastError: null,
      accountLabel: "pass-account @ imap.example.com",
    });
    expect(after.lastCheckedAt).toMatch(ISO);
    expect(after.lastCheckedAt).not.toBe(FIXED_NOW);
  });

  it("writes no label that the connection already holds", async () => {
    const id = await makeConnection({
      extra: [
        actions.setAccountLabel({
          accountLabel: "pass-account @ imap.example.com",
        }),
      ],
    });
    const before = (await operationTypes(id)).length;

    const result = await service.checkConnection(id, TEST_CTX);

    expect(result.accountLabel).toBe("pass-account @ imap.example.com");
    expect((await operationTypes(id)).slice(before)).toEqual([
      "RECORD_CHECK_RESULT",
    ]);
  });

  it("passes the check and keeps the previous label when labelling throws", async () => {
    const id = await makeConnection({
      connectorId: `${PIECES.labelThrows.name}#labelThrows`,
      extra: [actions.setAccountLabel({ accountLabel: "ops@example.com" })],
    });
    const before = (await operationTypes(id)).length;

    const result = await service.checkConnection(id, TEST_CTX);

    expect(result).toEqual({
      ok: true,
      detail: null,
      accountLabel: "ops@example.com",
    });
    expect(await state(id)).toMatchObject({
      status: "OK",
      accountLabel: "ops@example.com",
    });
    expect((await operationTypes(id)).slice(before)).toEqual([
      "RECORD_CHECK_RESULT",
    ]);
  });

  it("records ERROR with the failure detail when the check throws", async () => {
    const id = await makeConnection({
      connectorId: `${PIECES.fail.name}#fail`,
    });

    const result = await service.checkConnection(id, TEST_CTX);

    expect(result.ok).toBe(false);
    expect(result.detail).toBe("auth failed: bad credentials");
    const after = await state(id);
    expect(after).toMatchObject({
      status: "ERROR",
      lastError: "auth failed: bad credentials",
    });
    expect(after.lastCheckedAt).toMatch(ISO);
  });

  // A fixture that reads the master key would report "leaked" in this process.
  it("runs the check outside the reactor process", async () => {
    const id = await makeConnection({ connectorId: `${PIECES.env.name}#env` });

    const result = await service.checkConnection(id, TEST_CTX);

    expect(result).toEqual({
      ok: true,
      detail: null,
      accountLabel: "isolated",
    });
    expect(await state(id)).toMatchObject({
      status: "OK",
      accountLabel: "isolated",
    });
  });

  it("records ERROR when validate refuses without a reason", async () => {
    const id = await makeConnection({
      connectorId: `${PIECES.denied.name}#denied`,
    });

    const result = await service.checkConnection(id, TEST_CTX);

    expect(result).toEqual({
      ok: false,
      detail: "Connection check failed",
      accountLabel: null,
    });
    expect(await state(id)).toMatchObject({
      status: "ERROR",
      lastError: "Connection check failed",
    });
  });

  // The worker's own timeout is covered in src/pieces; here only the mapping
  // onto the recorded wording, without waiting it out.
  it("records ERROR when the worker times the check out", async () => {
    const runtime = service as unknown as {
      designWorker?: Pick<PieceWorker, "checkConnection">;
    };
    const previous = runtime.designWorker;
    runtime.designWorker = {
      checkConnection: () =>
        Promise.reject(new PieceWorkerTimeoutError(30_000)),
    };
    const id = await makeConnection();
    try {
      const result = await service.checkConnection(id, TEST_CTX);

      expect(result).toEqual({
        ok: false,
        detail: "Connection check timed out after 30s",
        accountLabel: null,
      });
      expect(await state(id)).toMatchObject({
        status: "ERROR",
        lastError: "Connection check timed out after 30s",
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
    const id = await makeConnection();
    try {
      await service.checkConnection(id, TEST_CTX);

      expect(request?.egress).toEqual(DEFAULT_EGRESS_POLICY);
    } finally {
      runtime.designWorker = previous;
    }
  });

  it("reports resolved credentials when the piece declares no validate", async () => {
    const id = await makeConnection({
      connectorId: `${PIECES.nocheck.name}#nocheck`,
    });

    const result = await service.checkConnection(id, TEST_CTX);

    expect(result).toEqual({
      ok: true,
      detail: "piece declares no auth.validate; credentials resolved",
      accountLabel: null,
    });
    expect(await state(id)).toMatchObject({ status: "OK", lastError: null });
  });

  it("hands validate the property values flat", async () => {
    const id = await makeConnection({
      connectorId: `${PIECES.validates.name}#validates`,
    });

    const result = await service.checkConnection(id, TEST_CTX);

    expect(result.ok).toBe(true);
    // Not the "declares no auth.validate" answer: a check really ran, and it
    // read the property values, which only the unwrapped form carries.
    expect(result.detail).toBeNull();
    expect((await state(id)).status).toBe("OK");
  });

  it("reports the reason validate gave for refusing", async () => {
    const id = await makeConnection({
      connectorId: `${PIECES.refuses.name}#refuses`,
    });

    const result = await service.checkConnection(id, TEST_CTX);

    expect(result).toMatchObject({
      ok: false,
      detail: "that host refused the login",
    });
    expect(await state(id)).toMatchObject({
      status: "ERROR",
      lastError: "that host refused the login",
    });
  });

  it("surfaces a missing secret by naming its ref", async () => {
    const id = await makeConnection({ secretRef: MISSING_SECRET_REF });

    const result = await service.checkConnection(id, TEST_CTX);

    expect(result.ok).toBe(false);
    expect(result.detail).toContain(MISSING_SECRET_REF);
    expect(await state(id)).toMatchObject({
      status: "ERROR",
      lastError: `No secret found for ref "${MISSING_SECRET_REF}"`,
    });
  });

  it("refuses OIDC without fetching a bundle", async () => {
    const id = await makeConnection({ authType: "OIDC" });
    const before = bundleRequests().length;

    const result = await service.checkConnection(id, TEST_CTX);

    expect(result).toEqual({
      ok: false,
      detail: "OIDC connections are not supported by the runtime yet",
      accountLabel: null,
    });
    expect(bundleRequests()).toHaveLength(before);
    expect(await state(id)).toMatchObject({
      status: "ERROR",
      lastError: "OIDC connections are not supported by the runtime yet",
    });
  });

  it("refuses a connection with nothing to authenticate with, without fetching a bundle", async () => {
    const id = await makeConnection({ configured: false, empty: true });
    const before = bundleRequests().length;

    const result = await service.checkConnection(id, TEST_CTX);

    expect(result).toEqual({
      ok: false,
      detail: "Connection is not configured",
      accountLabel: null,
    });
    expect(bundleRequests()).toHaveLength(before);
    expect(await state(id)).toMatchObject({
      status: "ERROR",
      lastError: "Connection is not configured",
    });
  });

  // SET_CONNECTOR leaves UNCONFIGURED behind and only a recorded check clears
  // it, so the first check of a filled-in connection must still run.
  it("checks a configured connection that has never been checked", async () => {
    const id = await makeConnection({ configured: false });
    expect((await state(id)).status).toBe("UNCONFIGURED");

    const result = await service.checkConnection(id, TEST_CTX);

    expect(result.ok).toBe(true);
    expect((await state(id)).status).toBe("OK");
  });

  it("refuses a revoked connection, every time, without recording anything", async () => {
    const id = await makeConnection({
      extra: [
        actions.recordCheckResult({ status: "REVOKED", checkedAt: FIXED_NOW }),
      ],
    });
    const before = (await operationTypes(id)).length;
    const fetched = bundleRequests().length;

    const first = await service.checkConnection(id, TEST_CTX);
    // A recorded ERROR would clear REVOKED and let this one through.
    const second = await service.checkConnection(id, TEST_CTX);

    for (const result of [first, second]) {
      expect(result.ok).toBe(false);
      expect(result.detail).toContain("revoked");
    }
    expect(await state(id)).toMatchObject({
      status: "REVOKED",
      lastCheckedAt: FIXED_NOW,
    });
    expect(await operationTypes(id)).toHaveLength(before);
    // Nothing reached the piece, so nothing shaped the stored secrets.
    expect(bundleRequests()).toHaveLength(fetched);
  });

  it("refuses a caller the subgraph cannot identify", async () => {
    const id = await makeConnection();

    await expect(service.checkConnection(id)).rejects.toThrow(
      "authenticated request",
    );
    expect((await state(id)).lastCheckedAt).toBe(FIXED_NOW);
  });

  it("checks against the newest version the piece's packument lists", async () => {
    const id = await makeConnection();

    const result = await service.checkConnection(id, TEST_CTX);

    expect(result.ok).toBe(true);
    expect(bundleRequests()).toContain(
      `/cdn/${PIECES.pass.name.replace("/", "-")}-${PIECES.pass.version}.tgz`,
    );
  });
});
