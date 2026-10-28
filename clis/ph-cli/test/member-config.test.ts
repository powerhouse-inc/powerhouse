import {
  primaryBackend,
  protocolEnv,
  type ReactorConfig,
} from "@powerhousedao/host-core";
import {
  mergeSwitchboardConfig,
  switchboardConfigSchema,
  type SwitchboardConfigInput,
} from "@powerhousedao/switchboard/config";
import { switchboardConfigFromEnv } from "@powerhousedao/switchboard/config/env";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  memberEnvOf,
  memberSwitchboardConfig,
} from "../src/runners/member-config.js";

type Env = Record<string, string | undefined>;

// The removed path: the block as set-if-absent env, readModel.url as dbPath,
// then the server's .env load, which sets only what is still unset.
function envProjectionConfig(
  reactor: ReactorConfig | undefined,
  env: Env,
  dotenv: Env = {},
): SwitchboardConfigInput {
  const projected: Env = { ...protocolEnv(reactor?.protocol) };
  const backend = primaryBackend(reactor);
  const storage = backend?.storage;
  const store = storage?.kind === "postgres" ? storage.url : storage?.dataDir;
  if (store) projected.PH_REACTOR_DATABASE_URL = store;
  if (backend?.packages?.dynamic) projected.DYNAMIC_MODEL_LOADING = "true";
  if (reactor?.workflows !== undefined) {
    projected.PH_WORKFLOWS_ENABLED = reactor.workflows ? "1" : "0";
  }
  const layer = switchboardConfigFromEnv({ ...dotenv, ...projected, ...env });
  const dbPath = backend?.readModel?.url || undefined;
  return dbPath
    ? mergeSwitchboardConfig(layer, {
        storage: { readModel: { url: dbPath }, reactor: { url: dbPath } },
      })
    : layer;
}

const parse = (layer: SwitchboardConfigInput) =>
  switchboardConfigSchema.parse(layer);

const pathBlock: ReactorConfig = {
  backends: {
    main: {
      kind: "in-process",
      storage: { kind: "path", dataDir: "/data/reactor" },
      readModel: { url: "/data/read" },
      packages: { dynamic: true },
    },
  },
  workflows: true,
  protocol: {
    featureFlags: { documentDecisions: true },
    createSignaturePolicy: "legacy",
  },
};

const postgresBlock: ReactorConfig = {
  backends: {
    main: {
      kind: "in-process",
      storage: { kind: "postgres", url: "postgres://host/block" },
    },
  },
};

describe("memberSwitchboardConfig keeps a single host's config (D1)", () => {
  const rows: {
    name: string;
    reactor: ReactorConfig | undefined;
    env: Env;
    dotenv?: Env;
    /** The reactor store, where it differs from the removed path. */
    reactorStore?: string;
  }[] = [
    { name: "no block, no env", reactor: undefined, env: {} },
    {
      name: "no block, env only",
      reactor: undefined,
      env: {
        PH_REACTOR_DATABASE_URL: "postgres://host/env",
        DATABASE_URL: "/env/read",
        AUTH_ENABLED: "true",
        PH_INSPECTION_CALLS_PER_MINUTE: "9",
        REACTOR_AUTH_ENFORCEMENT: "true",
      },
    },
    {
      name: "block, no env",
      reactor: pathBlock,
      env: {},
      reactorStore: "/data/reactor",
    },
    {
      name: "block under an env that sets the same keys",
      reactor: pathBlock,
      env: {
        PH_REACTOR_DATABASE_URL: "/env/reactor",
        DATABASE_URL: "/env/read",
        DYNAMIC_MODEL_LOADING: "false",
        PH_WORKFLOWS_ENABLED: "0",
        REACTOR_DOCUMENT_DECISIONS: "true",
        CREATE_SIGNATURE_POLICY: "legacy",
        REACTOR_UNSUPPORTED_STORED_DOCUMENTS: "read-only",
      },
      reactorStore: "/env/reactor",
    },
    {
      name: "block over a .env that sets the same keys",
      reactor: pathBlock,
      env: {},
      dotenv: {
        PH_REACTOR_DATABASE_URL: "/dotenv/reactor",
        DATABASE_URL: "/dotenv/read",
        DYNAMIC_MODEL_LOADING: "false",
        PH_WORKFLOWS_ENABLED: "0",
        REACTOR_DOCUMENT_DECISIONS: "false",
        AUTH_ENABLED: "true",
      },
      reactorStore: "/data/reactor",
    },
    {
      name: "readModel-only block over a .env that names a store",
      reactor: {
        backends: {
          main: {
            kind: "in-process",
            readModel: { url: "postgres://host/db" },
          },
        },
      },
      env: {},
      dotenv: { PH_SWITCHBOARD_DATABASE_URL: "postgres://host/dotenv" },
    },
    {
      name: "shell and .env both feed one setting",
      reactor: undefined,
      env: {
        PH_ATTACHMENT_STORAGE: "s3",
        PH_SWITCHBOARD_DATABASE_URL: "postgres://host/shell",
        PH_PRIVACY_ENABLED: "true",
        REACTOR_WORKERS: "2",
      },
      dotenv: {
        PH_ATTACHMENT_S3_ENDPOINT: "https://s3.example.com",
        PH_ATTACHMENT_S3_REGION: "eu-west-1",
        PH_ATTACHMENT_S3_BUCKET: "docs",
        PH_ATTACHMENT_S3_ACCESS_KEY_ID: "key",
        PH_ATTACHMENT_S3_SECRET_ACCESS_KEY: "secret",
        PH_REACTOR_DATABASE_URL: "postgres://host/dotenv",
        DATABASE_URL: "/dotenv/read",
        PH_PRIVACY_INTERVAL_MS: "5000",
        REACTOR_DB_POOL_SIZE_WORKER: "4",
      },
    },
    {
      name: "postgres block under PH_SWITCHBOARD_DATABASE_URL",
      reactor: postgresBlock,
      env: { PH_SWITCHBOARD_DATABASE_URL: "postgres://host/env" },
    },
    {
      name: "readModel-only block, no env",
      reactor: {
        backends: {
          main: {
            kind: "in-process",
            readModel: { url: "postgres://host/db" },
          },
        },
      },
      env: {},
    },
    {
      name: "readModel-only block under PH_SWITCHBOARD_DATABASE_URL",
      reactor: {
        backends: {
          main: {
            kind: "in-process",
            readModel: { url: "postgres://host/db" },
          },
        },
      },
      env: { PH_SWITCHBOARD_DATABASE_URL: "postgres://host/env" },
      reactorStore: "postgres://host/env",
    },
    {
      name: "postgres block under DATABASE_URL",
      reactor: postgresBlock,
      env: { DATABASE_URL: "/env/read" },
    },
  ];

  for (const row of rows) {
    it(row.name, async () => {
      const before = parse(
        envProjectionConfig(row.reactor, row.env, row.dotenv),
      );
      const after = parse(
        await memberSwitchboardConfig(
          { reactor: row.reactor },
          { shell: row.env, dotenv: row.dotenv ?? {} },
          { pluginHost: false },
        ),
      );
      const expected = row.reactorStore
        ? {
            ...before,
            storage: { ...before.storage, reactor: { url: row.reactorStore } },
          }
        : before;
      expect(after).toEqual(expected);
    });
  }

  it("puts config.switchboard under the env", async () => {
    const config = parse(
      await memberSwitchboardConfig(
        {
          config: {
            switchboard: {
              auth: { admins: ["0xmember"], defaultProtection: true },
              workers: { executor: { count: 2 } },
            },
          },
        },
        { shell: { ADMINS: "0xenv", REACTOR_WORKERS: "0" }, dotenv: {} },
        { pluginHost: false },
      ),
    );
    expect(config.auth.admins).toEqual(["0xenv"]);
    expect(config.auth.defaultProtection).toBe(true);
    expect(config.workers.executor.count).toBe(0);
  });
});

describe("memberEnvOf", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "ph-member-env-"));
    writeFileSync(
      path.join(dir, ".env"),
      "REACTOR_AUTH_ENFORCEMENT=false\nDATABASE_URL=/dotenv/read\n",
    );
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("keeps the names the shell set, whatever the file says", () => {
    expect(
      memberEnvOf(
        { REACTOR_AUTH_ENFORCEMENT: "false", DATABASE_URL: "/shell/read" },
        dir,
      ),
    ).toEqual({
      shell: { REACTOR_AUTH_ENFORCEMENT: "false", DATABASE_URL: "/shell/read" },
      dotenv: {},
    });
  });

  it("puts values loaded after the first look in the .env layer", () => {
    const env: Record<string, string> = { DATABASE_URL: "/shell/read" };
    expect(memberEnvOf(env, dir).dotenv).toEqual({
      REACTOR_AUTH_ENFORCEMENT: "false",
    });
    env.REACTOR_AUTH_ENFORCEMENT = "false";
    expect(memberEnvOf(env, dir)).toEqual({
      shell: { DATABASE_URL: "/shell/read" },
      dotenv: { REACTOR_AUTH_ENFORCEMENT: "false" },
    });
  });

  it("reads no .env under PH_NO_DOTENV or without a file", () => {
    expect(memberEnvOf({ PH_NO_DOTENV: "1" }, dir)).toEqual({
      shell: { PH_NO_DOTENV: "1" },
      dotenv: {},
    });
    rmSync(path.join(dir, ".env"));
    expect(memberEnvOf({}, dir)).toEqual({ shell: {}, dotenv: {} });
  });
});
