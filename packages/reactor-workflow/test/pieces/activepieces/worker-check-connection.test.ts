// checkConnection over the worker boundary, on offline fixture bundles:
// auth reaches the piece, the host process does not.
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
  checkConnection: async (ctx) => {
    if (ctx.auth.props.password !== "fixture-secret") {
      throw new Error("fixture: auth did not cross the boundary");
    }
    if (Object.keys(ctx.propsValue).length !== 0) {
      throw new Error("fixture: propsValue must be empty");
    }
    ctx.logger.info("check ran");
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
    const error = new Error("auth failed: bad credentials");
    error.secret = "fixture-secret";
    throw error;
  },
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
  nocheck: `
const app = { displayName: "NoCheck Fixture", actions: {} };
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
  hang: `
const app = {
  displayName: "Hang Fixture",
  actions: {},
  checkConnection: () => new Promise(() => {}),
};
module.exports = { app };
`,
  store: `
const app = {
  displayName: "Store Fixture",
  actions: {},
  checkConnection: async (ctx) => ctx.store.get("k"),
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
    process.env.PH_SECRETS_MASTER_KEY = "host-only-master-key";
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
    delete process.env.PH_SECRETS_MASTER_KEY;
    await rm(cacheDir, { recursive: true, force: true });
  });

  it("runs a declared check against the resolved auth", async () => {
    const result = await worker.checkConnection({
      bundleDir: bundleDir("pass"),
      auth: AUTH,
    });

    expect(result.output).toEqual({
      declared: true,
      result: { name: "pass-account" },
    });
    expect(result.touched).toEqual(
      expect.arrayContaining(["auth", "propsValue", "logger"]),
    );
  });

  it("reports a piece that declares no check", async () => {
    const result = await worker.checkConnection({
      bundleDir: bundleDir("nocheck"),
      auth: AUTH,
    });

    expect(result.output).toEqual({ declared: false });
  });

  it("reports a check that returns false", async () => {
    const result = await worker.checkConnection({
      bundleDir: bundleDir("denied"),
      auth: AUTH,
    });

    const outcome = result.output as CheckConnectionOutcome;
    expect(outcome.declared).toBe(true);
    expect(outcome.result).toBe(false);
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
      .checkConnection({ bundleDir: bundleDir("store"), auth: AUTH })
      .then(
        () => undefined,
        (e: unknown) => e,
      );

    expect(error).toBeInstanceOf(PieceWorkerError);
    expect((error as PieceWorkerError).serialized.unsupportedMember).toBe(
      "store.get",
    );
  });

  it("keeps host env out of the check", async () => {
    const result = await worker.checkConnection({
      bundleDir: bundleDir("env"),
      auth: AUTH,
    });

    expect(result.output).toEqual({
      declared: true,
      result: { name: "isolated" },
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
