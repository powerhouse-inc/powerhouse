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
import { describe, expect, it } from "vitest";
import { memberSwitchboardConfig } from "../src/runners/member-config.js";

type Env = Record<string, string | undefined>;

// The removed path: the block as set-if-absent env, readModel.url as dbPath.
function envProjectionConfig(
  reactor: ReactorConfig | undefined,
  env: Env,
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
  const layer = switchboardConfigFromEnv({ ...projected, ...env });
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
      const before = parse(envProjectionConfig(row.reactor, row.env));
      const after = parse(
        await memberSwitchboardConfig({ reactor: row.reactor }, row.env, {
          pluginHost: false,
        }),
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
        { ADMINS: "0xenv", REACTOR_WORKERS: "0" },
        { pluginHost: false },
      ),
    );
    expect(config.auth.admins).toEqual(["0xenv"]);
    expect(config.auth.defaultProtection).toBe(true);
    expect(config.workers.executor.count).toBe(0);
  });
});
