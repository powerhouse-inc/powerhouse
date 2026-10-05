// auth.validate and auth.getConnectionIdentifier over the worker boundary, on
// offline fixture bundles: auth reaches the piece, the host process does not.
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  PieceWorker,
  PieceWorkerError,
  PieceWorkerTimeoutError,
} from "../../../src/pieces/activepieces/worker/host.js";
import type { CheckConnectionOutcome } from "../../../src/pieces/activepieces/worker/protocol.js";

const FIXTURES = {
  pass: `
const app = {
  displayName: "Pass Fixture",
  actions: {},
  auth: {
    validate: async (ctx) => {
      if (ctx.auth.password !== "fixture-secret") {
        throw new Error("fixture: auth did not cross the boundary flat");
      }
      if (Object.keys(ctx).sort().join(",") !== "auth,server") {
        throw new Error("fixture: validate receives auth and server only");
      }
      return { valid: true };
    },
    getConnectionIdentifier: async (ctx) => "pass-account @ " + ctx.auth.host,
  },
};
module.exports = { app };
`,
  invalid: `
const app = {
  displayName: "Invalid Fixture",
  actions: {},
  auth: {
    validate: async () => ({ valid: false, error: "token rejected" }),
    getConnectionIdentifier: async () => {
      throw new Error("fixture: labelled a connection that failed");
    },
  },
};
module.exports = { app };
`,
  fail: `
const app = {
  displayName: "Fail Fixture",
  actions: {},
  auth: {
    validate: async () => {
      const error = new Error("auth failed: bad credentials");
      error.secret = "fixture-secret";
      throw error;
    },
  },
};
module.exports = { app };
`,
  unlabelled: `
const app = {
  displayName: "Unlabelled Fixture",
  actions: {},
  auth: {
    validate: async () => ({ valid: true }),
    getConnectionIdentifier: async () => undefined,
  },
};
module.exports = { app };
`,
  labelThrows: `
const app = {
  displayName: "Label Throws Fixture",
  actions: {},
  auth: {
    validate: async () => ({ valid: true }),
    getConnectionIdentifier: async () => {
      throw new Error("whoami answered 500");
    },
  },
};
module.exports = { app };
`,
  labelOnly: `
const app = {
  displayName: "Label Only Fixture",
  actions: {},
  auth: { getConnectionIdentifier: async (ctx) => ctx.auth.host },
};
module.exports = { app };
`,
  nocheck: `
const app = { displayName: "NoCheck Fixture", actions: {} };
module.exports = { app };
`,
  env: `
const app = {
  displayName: "Env Fixture",
  actions: {},
  auth: {
    validate: async () => ({ valid: true }),
    getConnectionIdentifier: async () =>
      process.env.PH_WORKFLOWS_SECRETS_MASTER_KEY ? "leaked" : "isolated",
  },
};
module.exports = { app };
`,
  hang: `
const app = {
  displayName: "Hang Fixture",
  actions: {},
  auth: { validate: () => new Promise(() => {}) },
};
module.exports = { app };
`,
  oidc: `
const app = {
  displayName: "OIDC Fixture",
  actions: {},
  auth: {
    validate: async (ctx) => {
      await ctx.server.mintOidcToken({ audience: "a" });
      return { valid: true };
    },
  },
};
module.exports = { app };
`,
} as const;

type FixtureName = keyof typeof FIXTURES;

const AUTH = {
  type: "CUSTOM_AUTH",
  props: { host: "imap.example.com", password: "fixture-secret" },
};

let cacheDir = "";
let worker: PieceWorker;

function bundleDir(name: FixtureName): string {
  return join(cacheDir, name);
}

describe("PieceWorker.checkConnection", () => {
  beforeAll(async () => {
    process.env.PH_WORKFLOWS_SECRETS_MASTER_KEY = "host-only-master-key";
    cacheDir = await mkdtemp(join(tmpdir(), "ap-worker-check-"));
    for (const name of Object.keys(FIXTURES) as FixtureName[]) {
      const dir = bundleDir(name);
      await mkdir(dir, { recursive: true });
      await writeFile(
        join(dir, "package.json"),
        JSON.stringify({ name, version: "1.0.0", main: "index.js" }),
      );
      await writeFile(join(dir, "index.js"), FIXTURES[name]);
    }
    worker = new PieceWorker();
  });

  afterAll(async () => {
    worker.dispose();
    delete process.env.PH_WORKFLOWS_SECRETS_MASTER_KEY;
    await rm(cacheDir, { recursive: true, force: true });
  });

  it("validates the flat auth and labels the connection", async () => {
    const result = await worker.checkConnection({
      bundleDir: bundleDir("pass"),
      auth: AUTH,
    });

    expect(result.output).toEqual({
      declared: true,
      valid: true,
      accountLabel: "pass-account @ imap.example.com",
    });
    expect(result.touched).toEqual(expect.arrayContaining(["auth"]));
  });

  it("reports a piece whose auth declares no validate", async () => {
    const result = await worker.checkConnection({
      bundleDir: bundleDir("nocheck"),
      auth: AUTH,
    });

    expect(result.output).toEqual({ declared: false, valid: true });
  });

  it("labels a connection whose auth declares no validate", async () => {
    const result = await worker.checkConnection({
      bundleDir: bundleDir("labelOnly"),
      auth: AUTH,
    });

    expect(result.output).toEqual({
      declared: false,
      valid: true,
      accountLabel: "imap.example.com",
    });
  });

  it("carries validate's error and does not label a failed check", async () => {
    const result = await worker.checkConnection({
      bundleDir: bundleDir("invalid"),
      auth: AUTH,
    });

    expect(result.output).toEqual({
      declared: true,
      valid: false,
      detail: "token rejected",
    });
  });

  it("passes the check when there is no label", async () => {
    const result = await worker.checkConnection({
      bundleDir: bundleDir("unlabelled"),
      auth: AUTH,
    });

    expect(result.output).toEqual({ declared: true, valid: true });
  });

  it("passes the check when the label throws, and says why", async () => {
    const result = await worker.checkConnection({
      bundleDir: bundleDir("labelThrows"),
      auth: AUTH,
    });

    const outcome = result.output as CheckConnectionOutcome;
    expect(outcome).toEqual({
      declared: true,
      valid: true,
      identifierError: "whoami answered 500",
    });
  });

  it("serializes a throwing check instead of crashing", async () => {
    const error: unknown = await worker
      .checkConnection({ bundleDir: bundleDir("fail"), auth: AUTH })
      .then(
        () => undefined,
        (e: unknown) => e,
      );

    expect(error).toBeInstanceOf(PieceWorkerError);
    expect((error as PieceWorkerError).serialized.message).toBe(
      "auth failed: bad credentials",
    );
  });

  it("names an unimplemented context member the check reached for", async () => {
    const error: unknown = await worker
      .checkConnection({ bundleDir: bundleDir("oidc"), auth: AUTH })
      .then(
        () => undefined,
        (e: unknown) => e,
      );

    expect(error).toBeInstanceOf(PieceWorkerError);
    expect((error as PieceWorkerError).serialized.unsupportedMember).toBe(
      "server.mintOidcToken",
    );
  });

  it("keeps host env out of the check", async () => {
    const result = await worker.checkConnection({
      bundleDir: bundleDir("env"),
      auth: AUTH,
    });

    expect(result.output).toEqual({
      declared: true,
      valid: true,
      accountLabel: "isolated",
    });
  });

  it("kills a hung check on timeout and replaces the worker", async () => {
    const error: unknown = await worker
      .checkConnection(
        { bundleDir: bundleDir("hang"), auth: AUTH },
        { timeoutMs: 500 },
      )
      .then(
        () => undefined,
        (e: unknown) => e,
      );
    expect(error).toBeInstanceOf(PieceWorkerTimeoutError);

    const result = await worker.checkConnection({
      bundleDir: bundleDir("pass"),
      auth: AUTH,
    });
    expect(result.output).toMatchObject({ declared: true });
  }, 15_000);
});
