import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  getVerb,
  type RunnerContext,
  type RunnerModule,
} from "@powerhousedao/host-core";
import type * as ResetService from "../src/services/switchboard-reset.js";
import {
  hostSchema as connectHostSchema,
  type ConnectHost,
} from "../src/runners/connect.js";
import {
  hostSchema as switchboardHostSchema,
  type SwitchboardHost,
} from "../src/runners/switchboard.js";

/** The bridges must call the SAME services the classic commands call — these
 * tests pin the host→args mapping, not the services themselves. */

// The services return their vite server; a handle needs only these two.
const fakeVite = (url: string) => ({
  resolvedUrls: { local: [url], network: [] },
  close: vi.fn().mockResolvedValue(undefined),
});
vi.mock("../src/services/connect-studio.js", () => ({
  runConnectStudio: vi
    .fn()
    .mockImplementation((args: { port: number }) =>
      Promise.resolve(fakeVite(`http://localhost:${args.port}/`)),
    ),
}));
vi.mock("@powerhousedao/ph-run/switchboard", () => ({
  // the real service returns the server handle; workflows off in these tests
  startSwitchboard: vi.fn().mockImplementation((args: { port: number }) =>
    Promise.resolve({
      workflowsEnabled: false,
      mcpEnabled: true,
      port: args.port,
      shutdown: vi.fn().mockResolvedValue(undefined),
    }),
  ),
}));
vi.mock("../src/services/connect-preview.js", () => ({
  runConnectPreview: vi
    .fn()
    .mockImplementation((args: { host: string; port: number }) =>
      Promise.resolve(fakeVite(`http://${args.host}:${args.port}/`)),
    ),
}));
vi.mock("@powerhousedao/ph-run/connect-server", () => ({
  runConnectServer: vi
    .fn()
    .mockImplementation((args: { host: string; port: number }) =>
      Promise.resolve(fakeVite(`http://${args.host}:${args.port}/`)),
    ),
}));
vi.mock("../src/services/connect-build.js", () => ({
  runConnectBuild: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../src/services/build.js", () => ({
  runBuild: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../src/services/switchboard-migrate.js", () => ({
  runSwitchboardMigrations: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../src/services/switchboard-reset.js", () => ({
  resetSwitchboardDatabase: vi.fn().mockResolvedValue(undefined),
}));

const ctx: RunnerContext = { projectRoot: "/lab", verb: "run", env: {} };

/** Verbs receive the PARSED host, as validateHost hands it to them. */
const connect = (host: ConnectHost) => connectHostSchema.parse(host);
const switchboard = (host: SwitchboardHost) =>
  switchboardHostSchema.parse(host);

/** The override a dev verb handed Studio. A host without `runner.plugins`
 * hands a function: Studio calls it at each start for the override with the
 * default composition. */
const handed = <T>(passed: T | (() => T)): T =>
  typeof passed === "function" ? (passed as () => T)() : passed;

const GENERIC_DEFAULTS = {
  allowAddDrive: true,
  sections: {
    remote: { enabled: true, allowAdd: true, allowDelete: true },
    local: { enabled: true, allowAdd: true, allowDelete: true },
  },
};

const connectHost = (over: Partial<ConnectHost> = {}): ConnectHost => ({
  name: "lab-connect",
  runner: { module: "@powerhousedao/ph-cli/runners/connect", port: 6599 },
  config: { branding: { appName: "Lab" } },
  ...over,
});

describe("connect bridge runner", () => {
  it("satisfies the runner contract and maps host → studio args", async () => {
    const runner = await import("../src/runners/connect.js");
    const { runConnectStudio } =
      await import("../src/services/connect-studio.js");
    expect(runner.kind).toBe("reactor");
    expect(runner.hostSchema.safeParse(connectHost()).success).toBe(true);

    await runner.dev(connect(connectHost()), ctx);
    const [args, logger, callerOverride] =
      vi.mocked(runConnectStudio).mock.calls[0];
    expect(args).toMatchObject({ port: 6599, open: false, printUrls: true });
    expect(logger).toBeUndefined();
    // No plugins list: the host's config, and the default composition for a
    // Studio (studio mode on) over the default config.
    expect(handed(callerOverride)).toEqual({
      branding: { appName: "Lab" },
      composition: [
        {
          module: "@powerhousedao/connect/plugins/generic",
          config: GENERIC_DEFAULTS,
        },
        { module: "@powerhousedao/connect/plugins/sentry", config: {} },
        {
          module: "@powerhousedao/connect/plugins/openpanel",
          config: { clientId: "", trackUiEvents: true, trackOperations: true },
        },
        { module: "@powerhousedao/vetra-studio/connect", config: {} },
      ],
    });
    // Its own Vite cache: Studio and other hosts' dev servers run side by side.
    expect(vi.mocked(runConnectStudio).mock.calls[0][3]?.cacheDir).toBe(
      join(ctx.projectRoot, "node_modules", ".vite-lab-connect"),
    );
  });

  it("keeps a package's connect host in a Vite cache named after the package", async () => {
    const runner = await import("../src/runners/connect.js");
    const { runConnectStudio } =
      await import("../src/services/connect-studio.js");
    vi.mocked(runConnectStudio).mockClear();
    await runner.dev(connect(connectHost()), {
      ...ctx,
      hostPackage: { name: "@acme/tools", root: "/store/tools" },
    });
    // In the project's node_modules, apart from a project host's of the
    // same name (`+` is in no host name).
    expect(vi.mocked(runConnectStudio).mock.calls[0][3]?.cacheDir).toBe(
      join(ctx.projectRoot, "node_modules", ".vite-@acme+tools+lab-connect"),
    );
  });

  it("serves the browser reactor's in-memory store to Connect", async () => {
    const runner = await import("../src/runners/connect.js");
    const { runConnectStudio } =
      await import("../src/services/connect-studio.js");
    vi.mocked(runConnectStudio).mockClear();
    await runner.dev(
      connect(
        connectHost({
          reactor: {
            backends: {
              main: { kind: "in-process", storage: { kind: "memory" } },
            },
          },
        }),
      ),
      ctx,
    );
    const callerOverride = handed(vi.mocked(runConnectStudio).mock.calls[0][2]);
    expect(callerOverride?.instance).toMatchObject({
      reactorWorker: false,
      reactorClient: "in-process",
      storage: "memory",
    });
  });

  it("run is dev-studio in phase 0; defaults apply without runner.port", async () => {
    const runner = await import("../src/runners/connect.js");
    const { runConnectStudio } =
      await import("../src/services/connect-studio.js");
    vi.mocked(runConnectStudio).mockClear();
    await runner.run(
      connect(connectHost({ runner: { module: "m", openBrowser: true } })),
      ctx,
    );
    expect(vi.mocked(runConnectStudio).mock.calls[0][0]).toMatchObject({
      port: 3000,
      open: true,
    });
  });

  it("passes runner.host to vite as the bind address, and leaves vite's default when unset", async () => {
    const runner = await import("../src/runners/connect.js");
    const { runConnectStudio } =
      await import("../src/services/connect-studio.js");
    vi.mocked(runConnectStudio).mockClear();
    await runner.dev(
      connect(connectHost({ runner: { module: "m", host: "0.0.0.0" } })),
      ctx,
    );
    await runner.dev(connect(connectHost()), ctx);
    const [withHost, withoutHost] = vi
      .mocked(runConnectStudio)
      .mock.calls.map((call) => call[0]);
    expect(withHost).toMatchObject({ host: "0.0.0.0" });
    // As `ph connect studio` without --host carries it.
    expect(withoutHost).toHaveProperty("host", undefined);
  });

  it("warns at boot on config owned by a plugin the composition lacks", async () => {
    const runner = await import("../src/runners/connect.js");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const host = connect(
        connectHost({
          runner: {
            module: "@powerhousedao/ph-cli/runners/connect",
            port: 6599,
            plugins: ["@powerhousedao/connect/plugins/workflows"],
          },
          config: { drives: { allowAddDrive: true } },
        }),
      );
      await runner.dev(host, { ...ctx, verb: "dev" });
      const messages = warn.mock.calls.map((call) => String(call[0]));
      expect(messages).toHaveLength(1);
      expect(messages[0]).toContain(
        "hosts/lab-connect/host.js: config.drives.allowAddDrive is dead config",
      );
      expect(messages[0]).toContain('"@powerhousedao/connect/plugins/generic"');
      expect(messages[0]).toContain('verb "dev"');

      // Composing the owner silences it.
      warn.mockClear();
      await runner.dev(
        connect(
          connectHost({
            runner: {
              module: "@powerhousedao/ph-cli/runners/connect",
              plugins: [
                {
                  module: "@powerhousedao/connect/plugins/generic",
                  config: { allowAddDrive: true },
                },
              ],
            },
            config: { drives: { allowAddDrive: true } },
          }),
        ),
        { ...ctx, verb: "dev" },
      );
      expect(warn).not.toHaveBeenCalled();

      // A host without plugins still serves the value, by the default composition.
      await runner.dev(
        connect(connectHost({ config: { drives: { allowAddDrive: true } } })),
        { ...ctx, verb: "dev" },
      );
      const deprecations = warn.mock.calls.map((call) => String(call[0]));
      expect(deprecations).toHaveLength(1);
      expect(deprecations[0]).toContain(
        "hosts/lab-connect/host.js: config.drives.allowAddDrive is only read while the host has no runner.plugins, by the default composition.",
      );
    } finally {
      warn.mockRestore();
      log.mockRestore();
    }
  });

  it("rejects a host without a name", async () => {
    const runner = await import("../src/runners/connect.js");
    expect(
      runner.hostSchema.safeParse({ runner: { module: "m" } }).success,
    ).toBe(false);
  });

  it("takes output tokens in config.drives.defaultDrives[].url and renown.switchboardUrl (declared form only)", async () => {
    const runner = await import("../src/runners/connect.js");
    const graphql = {
      $output: { host: "switchboard", path: ["endpoints", "graphql"] },
    };
    const host: ConnectHost = {
      name: "connect",
      runner: { module: "@powerhousedao/ph-cli/runners/connect" },
      config: {
        drives: {
          defaultDrives: [
            {
              url: {
                $output: {
                  host: "switchboard",
                  path: ["drives", "sektar", "url"],
                },
              },
            },
          ],
        },
        renown: { switchboardUrl: graphql },
      },
    };
    expect(runner.declaredHostSchema.safeParse(host).error).toBeUndefined();
    expect(runner.hostSchema.safeParse(host).success).toBe(false);
    // a field that names no other host's output stays plain
    expect(
      runner.declaredHostSchema.safeParse({
        ...host,
        config: { renown: { url: graphql } },
      }).success,
    ).toBe(false);
  });
});

describe("switchboard bridge runner", () => {
  it("maps run → production and dev → dev loader", async () => {
    const runner = await import("../src/runners/switchboard.js");
    const { startSwitchboard } =
      await import("@powerhousedao/ph-run/switchboard");
    const host = switchboard({
      name: "lab-switchboard",
      runner: {
        module: "@powerhousedao/ph-cli/runners/switchboard",
        port: 7599,
      },
    });

    const { switchboardServiceArgs } =
      await import("@powerhousedao/ph-run/service-args");
    const classic = await switchboardServiceArgs();
    // sanity on the classic shape this gate compares against
    expect(classic).toMatchObject({
      mcp: true,
      remoteDrives: [],
    });

    await runner.run(host, ctx);
    // THE PARITY GATE: the FULL call, key for key (strict — a key present as
    // undefined is not the same as a missing key), equals the classic
    // `ph switchboard` args with only the host-owned keys overlaid. A
    // subset match (toMatchObject) once let the hand-built object drop
    // `dbPath`, which put both PGlite stores on one dir.
    expect(vi.mocked(startSwitchboard).mock.calls[0][0]).toStrictEqual({
      ...classic,
      port: 7599,
      // run = production, exactly as `ph switchboard` without --dev
      dev: undefined,
      // Not a classic arg: `/ready` waits for the drives the runner seeds.
      readyAfter: expect.any(Promise) as unknown,
    });
    expect(vi.mocked(startSwitchboard).mock.calls[0][0]).toHaveProperty(
      "dbPath",
      undefined,
    );

    await runner.dev(host, ctx);
    expect(vi.mocked(startSwitchboard).mock.calls[1][0]).toStrictEqual({
      ...classic,
      port: 7599,
      dev: true,
      readyAfter: expect.any(Promise) as unknown,
    });
  });

  it("exposes orthogonal run/serve/dev/build verbs", async () => {
    const runner = await import("../src/runners/switchboard.js");
    // run/serve/dev/build are all present and distinct jobs; serve is run's
    // alias (a server IS its served stack), build builds without serving.
    expect(typeof runner.run).toBe("function");
    expect(typeof runner.dev).toBe("function");
    expect(typeof runner.build).toBe("function");
    expect(runner.serve).toBe(runner.run);
    expect(runner.build).not.toBe(runner.run);
    expect(runner.dev).not.toBe(runner.run);
  });

  it("lists the store verbs for an unknown verb", async () => {
    const runner = await import("../src/runners/switchboard.js");
    const spec = "@powerhousedao/ph-cli/runners/switchboard";
    expect(() =>
      getVerb({ ...runner } as unknown as RunnerModule, spec, "start"),
    ).toThrow(
      /does not support the verb "start"\. Supported verbs: build, dev, migrate, migrate-status, reset, run, serve\./,
    );
    for (const verb of ["migrate", "migrate-status", "reset"]) {
      expect(
        typeof getVerb({ ...runner } as unknown as RunnerModule, spec, verb),
      ).toBe("function");
    }
  });

  it("migrate and migrate-status call the classic service on the store run opens", async () => {
    const runner = await import("../src/runners/switchboard.js");
    const { startSwitchboard } =
      await import("@powerhousedao/ph-run/switchboard");
    const { runSwitchboardMigrations } =
      await import("../src/services/switchboard-migrate.js");
    vi.mocked(startSwitchboard).mockClear();
    vi.mocked(runSwitchboardMigrations).mockClear();
    const bare = switchboard({
      name: "lab-switchboard",
      runner: { module: "m", port: 7599 },
    });

    // `ph switchboard --migrate` calls { dbPath, statusOnly: undefined };
    // no store named anywhere leaves dbPath unset, as without --db-path.
    await runner.migrate(bare, { ...ctx, verb: "migrate" });
    expect(vi.mocked(runSwitchboardMigrations)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(runSwitchboardMigrations).mock.calls[0]).toStrictEqual([
      { dbPath: undefined, statusOnly: undefined },
    ]);

    // the env `run` reads the reactor store from
    await runner.migrate(bare, {
      ...ctx,
      verb: "migrate",
      env: { PH_SWITCHBOARD_DATABASE_URL: "postgres://host/env" },
    });
    expect(vi.mocked(runSwitchboardMigrations).mock.calls[1]).toStrictEqual([
      { dbPath: "postgres://host/env", statusOnly: undefined },
    ]);

    // `ph switchboard --migrate-status` calls { dbPath, statusOnly: true }
    vi.mocked(runSwitchboardMigrations).mockClear();
    await runner["migrate-status"](
      switchboard({
        name: "lab-switchboard",
        runner: { module: "m" },
        reactor: {
          backends: {
            main: {
              kind: "in-process",
              storage: { kind: "postgres", url: "postgres://host/block" },
            },
          },
        },
      }),
      { ...ctx, verb: "migrate-status" },
    );
    expect(vi.mocked(runSwitchboardMigrations)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(runSwitchboardMigrations).mock.calls[0]).toStrictEqual([
      { dbPath: "postgres://host/block", statusOnly: true },
    ]);

    expect(vi.mocked(startSwitchboard)).not.toHaveBeenCalled();
  });

  it("reset calls the classic service with the host's stores as its env, and no yes", async () => {
    const runner = await import("../src/runners/switchboard.js");
    const { startSwitchboard } =
      await import("@powerhousedao/ph-run/switchboard");
    const { resetSwitchboardDatabase } =
      await import("../src/services/switchboard-reset.js");
    vi.mocked(startSwitchboard).mockClear();
    vi.mocked(resetSwitchboardDatabase).mockClear();
    const seen: Record<string, string | undefined> = {};
    vi.mocked(resetSwitchboardDatabase).mockImplementationOnce(() => {
      seen.reactor = process.env.PH_REACTOR_DATABASE_URL;
      seen.readModel = process.env.DATABASE_URL;
      seen.both = process.env.PH_SWITCHBOARD_DATABASE_URL;
      return Promise.resolve();
    });
    const envBefore = { ...process.env };
    const dataDir = mkdtempSync(join(tmpdir(), "ph-bridge-reset-"));
    try {
      await runner.reset(
        switchboard({
          name: "lab-switchboard",
          runner: { module: "m" },
          reactor: {
            backends: {
              main: {
                kind: "in-process",
                storage: { kind: "path", dataDir },
                readModel: { url: "dev.db" },
              },
            },
          },
        }),
        { ...ctx, verb: "reset" },
      );
      expect(vi.mocked(resetSwitchboardDatabase)).toHaveBeenCalledTimes(1);
      // `ph switchboard --reset` without --db-path and without --yes
      expect(vi.mocked(resetSwitchboardDatabase).mock.calls[0]).toStrictEqual([
        { dbPath: undefined, yes: undefined },
      ]);
      expect(seen).toEqual({
        reactor: dataDir,
        readModel: "dev.db",
        both: undefined,
      });
      expect(process.env).toEqual(envBefore);
      expect(vi.mocked(startSwitchboard)).not.toHaveBeenCalled();
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it("store verbs read --db-path and --yes from this invocation", async () => {
    const runner = await import("../src/runners/switchboard.js");
    const { runSwitchboardMigrations } =
      await import("../src/services/switchboard-migrate.js");
    const { resetSwitchboardDatabase } =
      await import("../src/services/switchboard-reset.js");
    vi.mocked(runSwitchboardMigrations).mockClear();
    vi.mocked(resetSwitchboardDatabase).mockClear();
    const bare = switchboard({
      name: "lab-switchboard",
      runner: { module: "m", port: 7599 },
    });

    // `ph switchboard --migrate --db-path elsewhere.db`
    await runner.migrate(bare, {
      ...ctx,
      verb: "migrate",
      argv: ["--db-path", "elsewhere.db"],
    });
    expect(vi.mocked(runSwitchboardMigrations).mock.calls[0]).toStrictEqual([
      { dbPath: "elsewhere.db", statusOnly: undefined },
    ]);

    // `ph switchboard --reset --yes`
    await runner.reset(bare, { ...ctx, verb: "reset", argv: ["--yes"] });
    expect(vi.mocked(resetSwitchboardDatabase).mock.calls[0]).toStrictEqual([
      { dbPath: undefined, yes: true },
    ]);
    await runner.reset(bare, { ...ctx, verb: "reset", argv: ["-y"] });
    expect(vi.mocked(resetSwitchboardDatabase).mock.calls[1]).toStrictEqual([
      { dbPath: undefined, yes: true },
    ]);
  });

  it("reset refuses without confirmation and deletes nothing", async () => {
    const runner = await import("../src/runners/switchboard.js");
    const actual = await vi.importActual<typeof ResetService>(
      "../src/services/switchboard-reset.js",
    );
    const { resetSwitchboardDatabase } =
      await import("../src/services/switchboard-reset.js");
    vi.mocked(resetSwitchboardDatabase).mockClear();
    vi.mocked(resetSwitchboardDatabase).mockImplementationOnce(
      actual.resetSwitchboardDatabase,
    );
    // not a terminal a person answers on: the service has only --yes left
    vi.stubEnv("CI", "1");
    const exit = vi.spyOn(process, "exit").mockImplementation((code) => {
      throw new Error(`process.exit ${String(code)}`);
    });
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const reactorDir = mkdtempSync(join(tmpdir(), "ph-bridge-reset-reactor-"));
    const readDir = mkdtempSync(join(tmpdir(), "ph-bridge-reset-read-"));
    writeFileSync(join(reactorDir, "PG_VERSION"), "17");
    writeFileSync(join(readDir, "PG_VERSION"), "17");
    try {
      await expect(
        runner.reset(
          switchboard({
            name: "lab-switchboard",
            runner: { module: "m" },
            reactor: {
              backends: {
                main: {
                  kind: "in-process",
                  storage: { kind: "path", dataDir: reactorDir },
                  readModel: { url: readDir },
                },
              },
            },
          }),
          { ...ctx, verb: "reset" },
        ),
      ).rejects.toThrow("process.exit 1");
      const printed = (spy: { mock: { calls: unknown[][] } }) =>
        spy.mock.calls.map((call) => call.map(String).join(" ")).join("\n");
      // it was the host's two stores it was about to delete
      expect(printed(log)).toContain(`  - ${reactorDir}`);
      expect(printed(log)).toContain(`  - ${readDir}`);
      expect(printed(error)).toContain(
        "Refusing to reset in a non-interactive context without --yes",
      );
      expect(existsSync(join(reactorDir, "PG_VERSION"))).toBe(true);
      expect(existsSync(join(readDir, "PG_VERSION"))).toBe(true);
    } finally {
      exit.mockRestore();
      log.mockRestore();
      error.mockRestore();
      vi.unstubAllEnvs();
      rmSync(reactorDir, { recursive: true, force: true });
      rmSync(readDir, { recursive: true, force: true });
    }
  });

  it("passes the reactor block as the member's config, writing no env (P2.4)", async () => {
    const runner = await import("../src/runners/switchboard.js");
    const { startSwitchboard } =
      await import("@powerhousedao/ph-run/switchboard");
    vi.mocked(startSwitchboard).mockClear();
    const envBefore = { ...process.env };
    // a real, writable path: the runner mkdirs a path-storage dataDir
    // before boot ("/data/pg" EACCESed on Linux CI)
    const dataDir = mkdtempSync(join(tmpdir(), "ph-bridge-datadir-"));
    try {
      await runner.run(
        switchboard({
          name: "lab-switchboard",
          runner: { module: "m", port: 7599 },
          reactor: {
            backends: {
              main: {
                kind: "in-process",
                storage: { kind: "path", dataDir },
                readModel: { url: "dev.db" },
              },
            },
            protocol: { featureFlags: { documentDecisions: true } },
          },
          config: { switchboard: { inspection: { enabled: false } } },
        }),
        ctx,
      );
      expect(process.env).toEqual(envBefore);
      const [args, , member] = vi.mocked(startSwitchboard).mock.calls[0];
      // The read model rides the config, never `dbPath` (which named both stores).
      expect(args).toHaveProperty("dbPath", undefined);
      expect(member).toEqual({
        storage: {
          reactor: { url: dataDir },
          readModel: { url: "dev.db" },
        },
        protocol: { featureFlags: { documentDecisions: true } },
        inspection: { enabled: false },
      });
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it("lets the operator's env win over the member's config (D1)", async () => {
    const runner = await import("../src/runners/switchboard.js");
    const { startSwitchboard } =
      await import("@powerhousedao/ph-run/switchboard");
    vi.mocked(startSwitchboard).mockClear();
    await runner.run(
      switchboard({
        name: "lab-switchboard",
        runner: { module: "m" },
        reactor: {
          backends: {
            main: {
              kind: "in-process",
              storage: { kind: "postgres", url: "postgres://host/block" },
            },
          },
        },
        config: {
          switchboard: {
            auth: { enabled: false, admins: ["0xmember"] },
            inspection: { callsPerMinute: 5 },
          },
        },
      }),
      {
        ...ctx,
        env: {
          PH_REACTOR_DATABASE_URL: "postgres://host/env",
          AUTH_ENABLED: "true",
          PH_INSPECTION_CALLS_PER_MINUTE: "9",
        },
      },
    );
    const member = vi.mocked(startSwitchboard).mock.calls[0][2];
    expect(member).toMatchObject({
      storage: { reactor: { url: "postgres://host/env" } },
      auth: { enabled: true, admins: ["0xmember"] },
      inspection: { callsPerMinute: 9 },
    });
  });

  it("refuses a config.switchboard key the runner or the reactor block owns", () => {
    for (const config of [
      { server: { port: 1 } },
      { drive: {} },
      { auth: { unknown: true } },
      { protocol: { featureFlags: { authEnforcement: true } } },
      { storage: { reactor: { url: "postgres://host/db" } } },
      { storage: { readModel: { url: "postgres://host/db" } } },
      { packages: { dynamic: true } },
    ]) {
      expect(
        switchboardHostSchema.safeParse({
          name: "lab-switchboard",
          runner: { module: "m" },
          config: { switchboard: config },
        }).success,
      ).toBe(false);
    }
  });

  it("refuses a readModel-only block: readModel.url no longer holds the reactor store", async () => {
    const runner = await import("../src/runners/switchboard.js");
    const { startSwitchboard } =
      await import("@powerhousedao/ph-run/switchboard");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const readModelOnly = switchboard({
      name: "lab-switchboard",
      runner: { module: "m" },
      reactor: {
        backends: {
          main: {
            kind: "in-process",
            readModel: { url: "postgres://host/db" },
          },
        },
      },
    });
    try {
      vi.mocked(startSwitchboard).mockClear();
      await expect(runner.run(readModelOnly, ctx)).rejects.toThrow(
        "readModel.url (postgres://host/db) is the only store this host names",
      );
      expect(startSwitchboard).not.toHaveBeenCalled();

      // An env var that names the store takes it.
      warn.mockClear();
      vi.mocked(startSwitchboard).mockClear();
      await runner.run(readModelOnly, {
        ...ctx,
        env: { PH_SWITCHBOARD_DATABASE_URL: "postgres://host/env" },
      });
      expect(vi.mocked(startSwitchboard).mock.calls[0][2]).toMatchObject({
        storage: {
          reactor: { url: "postgres://host/env" },
          readModel: { url: "postgres://host/db" },
        },
      });
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it("puts a project .env under reactor.protocol and the block's storage, as on main", async () => {
    const runner = await import("../src/runners/switchboard.js");
    const { startSwitchboard } =
      await import("@powerhousedao/ph-run/switchboard");
    const dir = mkdtempSync(join(tmpdir(), "ph-bridge-dotenv-"));
    writeFileSync(
      join(dir, ".env"),
      [
        "REACTOR_AUTH_ENFORCEMENT=false",
        "PH_REACTOR_DATABASE_URL=postgres://host/dotenv",
        "PH_INSPECTION_CALLS_PER_MINUTE=4",
      ].join("\n"),
    );
    const cwd = vi.spyOn(process, "cwd").mockReturnValue(dir);
    const host = switchboard({
      name: "lab-switchboard",
      runner: { module: "m" },
      reactor: {
        backends: {
          main: {
            kind: "in-process",
            storage: { kind: "postgres", url: "postgres://host/block" },
          },
        },
        protocol: { featureFlags: { authEnforcement: true } },
      },
    });
    try {
      // One env, before and after the first server import loads the .env into it.
      const env: Record<string, string> = {};
      for (const loaded of [false, true]) {
        if (loaded) env.REACTOR_AUTH_ENFORCEMENT = "false";
        vi.mocked(startSwitchboard).mockClear();
        await runner.run(host, { ...ctx, env });
        expect(vi.mocked(startSwitchboard).mock.calls[0][2]).toMatchObject({
          storage: { reactor: { url: "postgres://host/block" } },
          protocol: { featureFlags: { authEnforcement: true } },
          inspection: { callsPerMinute: 4 },
        });
      }
      // The shell still wins over the block's store.
      vi.mocked(startSwitchboard).mockClear();
      await runner.run(host, {
        ...ctx,
        env: { PH_REACTOR_DATABASE_URL: "postgres://host/shell" },
      });
      expect(vi.mocked(startSwitchboard).mock.calls[0][2]).toMatchObject({
        storage: { reactor: { url: "postgres://host/shell" } },
      });
    } finally {
      cwd.mockRestore();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("reads one env from the shell and the .env (S3 split across both)", async () => {
    const runner = await import("../src/runners/switchboard.js");
    const { startSwitchboard } =
      await import("@powerhousedao/ph-run/switchboard");
    const dir = mkdtempSync(join(tmpdir(), "ph-bridge-dotenv-"));
    writeFileSync(
      join(dir, ".env"),
      [
        "PH_ATTACHMENT_S3_ENDPOINT=https://s3.example.com",
        "PH_ATTACHMENT_S3_REGION=eu-west-1",
        "PH_ATTACHMENT_S3_BUCKET=docs",
        "PH_ATTACHMENT_S3_ACCESS_KEY_ID=key",
        "PH_ATTACHMENT_S3_SECRET_ACCESS_KEY=secret",
        "PH_REACTOR_DATABASE_URL=postgres://host/dotenv",
      ].join("\n"),
    );
    const cwd = vi.spyOn(process, "cwd").mockReturnValue(dir);
    try {
      vi.mocked(startSwitchboard).mockClear();
      await runner.run(
        switchboard({ name: "lab-switchboard", runner: { module: "m" } }),
        {
          ...ctx,
          env: {
            PH_ATTACHMENT_STORAGE: "s3",
            PH_SWITCHBOARD_DATABASE_URL: "postgres://host/shell",
          },
        },
      );
      expect(vi.mocked(startSwitchboard).mock.calls[0][2]).toMatchObject({
        attachments: { storage: { kind: "s3", s3: { bucket: "docs" } } },
        // PH_REACTOR ?? PH_SWITCHBOARD over the one env, as on main.
        storage: {
          reactor: { url: "postgres://host/dotenv" },
          readModel: { url: "postgres://host/shell" },
        },
      });
    } finally {
      cwd.mockRestore();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("keeps a shell value the shell's even when the .env holds the same value", async () => {
    const runner = await import("../src/runners/switchboard.js");
    const { startSwitchboard } =
      await import("@powerhousedao/ph-run/switchboard");
    const dir = mkdtempSync(join(tmpdir(), "ph-bridge-dotenv-"));
    writeFileSync(
      join(dir, ".env"),
      "REACTOR_AUTH_ENFORCEMENT=false\nPH_REACTOR_DATABASE_URL=postgres://host/x\n",
    );
    const cwd = vi.spyOn(process, "cwd").mockReturnValue(dir);
    const host = (protocol: boolean) =>
      switchboard({
        name: "lab-switchboard",
        runner: { module: "m" },
        reactor: {
          backends: {
            main: {
              kind: "in-process",
              storage: { kind: "postgres", url: "postgres://host/y" },
            },
          },
          ...(protocol
            ? { protocol: { featureFlags: { authEnforcement: true } } }
            : {}),
        },
      });
    try {
      await expect(
        runner.run(host(true), {
          ...ctx,
          env: { REACTOR_AUTH_ENFORCEMENT: "false" },
        }),
      ).rejects.toThrow(
        /reactor\.protocol conflict.*REACTOR_AUTH_ENFORCEMENT/s,
      );
      vi.mocked(startSwitchboard).mockClear();
      await runner.run(host(false), {
        ...ctx,
        env: { PH_REACTOR_DATABASE_URL: "postgres://host/x" },
      });
      expect(vi.mocked(startSwitchboard).mock.calls[0][2]).toMatchObject({
        storage: { reactor: { url: "postgres://host/x" } },
      });
    } finally {
      cwd.mockRestore();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("fails loudly when the env contradicts reactor.protocol (P2.6)", async () => {
    const runner = await import("../src/runners/switchboard.js");
    await expect(
      runner.run(
        switchboard({
          name: "lab-switchboard",
          runner: { module: "m" },
          reactor: { protocol: { featureFlags: { authEnforcement: false } } },
        }),
        { ...ctx, env: { REACTOR_AUTH_ENFORCEMENT: "true" } },
      ),
    ).rejects.toThrow(/reactor\.protocol conflict.*REACTOR_AUTH_ENFORCEMENT/s);
  });
});

describe("connect bridge runner — serve/build verbs (P3.3)", () => {
  it("serve needs vite only to open a browser, or when asked for it", async () => {
    const runner = await import("../src/runners/connect.js");
    const { runConnectPreview } =
      await import("../src/services/connect-preview.js");
    vi.mocked(runConnectPreview).mockClear();
    const opening = connectHost({
      runner: {
        module: "@powerhousedao/ph-cli/runners/connect",
        port: 6599,
        openBrowser: true,
      },
    });
    await runner.serve(connect(opening), ctx);
    expect(runConnectPreview).toHaveBeenCalledOnce();

    vi.mocked(runConnectPreview).mockClear();
    vi.stubEnv("PH_CONNECT_SERVER", "vite");
    await runner.serve(connect(connectHost()), ctx);
    vi.unstubAllEnvs();
    expect(runConnectPreview).toHaveBeenCalledOnce();
  });

  it("serve maps to the built-in server with runner options", async () => {
    const runner = await import("../src/runners/connect.js");
    const { runConnectServer } =
      await import("@powerhousedao/ph-run/connect-server");
    await runner.serve(
      connect({
        name: "lab-connect",
        runner: { module: "m", port: 8099, outDir: "build-out" },
      }),
      ctx,
    );
    expect(vi.mocked(runConnectServer).mock.calls[0][0]).toMatchObject({
      port: 8099,
      outDir: "build-out",
      cors: true,
      printUrls: true,
    });
    // No plugins list: the server is told to add the default composition
    // to the config it serves; the override itself carries none.
    const override = vi.mocked(runConnectServer).mock.calls[0][1];
    expect(override?.defaultComposition).toBe(true);
    expect(override?.connect?.composition).toBeUndefined();
  });

  it("leaves a host with a plugins list its own composition, on dev and serve", async () => {
    const runner = await import("../src/runners/connect.js");
    const { runConnectStudio } =
      await import("../src/services/connect-studio.js");
    const { runConnectServer } =
      await import("@powerhousedao/ph-run/connect-server");
    vi.mocked(runConnectStudio).mockClear();
    vi.mocked(runConnectServer).mockClear();
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const declared = connectHost({
      runner: {
        module: "@powerhousedao/ph-cli/runners/connect",
        port: 6599,
        plugins: [],
      },
    });
    await runner.dev(connect(declared), ctx);
    // An object, as before: nothing is worked out at Studio's start.
    const studio = vi.mocked(runConnectStudio).mock.calls[0][2];
    expect(typeof studio).toBe("object");
    expect(studio).toMatchObject({ composition: [] });
    await runner.serve(connect(declared), { ...ctx, verb: "serve" });
    const served = vi.mocked(runConnectServer).mock.calls[0][1];
    expect(served).not.toHaveProperty("defaultComposition");
    expect(served?.connect?.composition).toEqual([]);
    expect(log.mock.calls.flat().join("\n")).not.toContain(
      "default composition",
    );

    // Without the list, the terminal is told at each start.
    log.mockClear();
    await runner.dev(connect(connectHost()), ctx);
    expect(log.mock.calls.flat()).toContain(
      "[connect] hosts/lab-connect/host.js declares no runner.plugins: serving Connect's default composition.",
    );
    log.mockRestore();
  });

  it("serves the host as it reads at each restart of Studio", async () => {
    const runner = await import("../src/runners/connect.js");
    const { runConnectStudio } =
      await import("../src/services/connect-studio.js");
    vi.mocked(runConnectStudio).mockClear();
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const declared = (appName: string) =>
      connect(
        connectHost({
          runner: {
            module: "@powerhousedao/ph-cli/runners/connect",
            port: 6599,
            plugins: [],
          },
          config: { branding: { appName } },
        }),
      );
    await runner.dev(declared("Before"), {
      ...ctx,
      reloadHost: () => Promise.resolve(declared("After")),
    });
    const [, , served, options] = vi.mocked(runConnectStudio).mock.calls[0];
    const serving = () => (typeof served === "function" ? served() : served);
    expect(serving()).toMatchObject({ branding: { appName: "Before" } });
    await options?.beforeRestart?.();
    expect(serving()).toMatchObject({ branding: { appName: "After" } });
    log.mockRestore();
  });

  it("works the dev default composition out again at each start of Studio", async () => {
    const runner = await import("../src/runners/connect.js");
    const { runConnectStudio } =
      await import("../src/services/connect-studio.js");
    vi.mocked(runConnectStudio).mockClear();
    const project = mkdtempSync(join(tmpdir(), "ph-default-composition-"));
    const cwd = vi.spyOn(process, "cwd").mockReturnValue(project);
    const modules = () =>
      (
        handed(vi.mocked(runConnectStudio).mock.calls[0][2]) as {
          composition?: { module: string }[];
        }
      ).composition?.map((entry) => entry.module);
    const ASSISTANT = "@powerhousedao/connect/plugins/assistant";
    const WORKFLOWS = "@powerhousedao/connect/plugins/workflows";
    try {
      await runner.dev(
        connect(connectHost({ config: { ai: { assistantEnabled: false } } })),
        ctx,
      );
      expect(modules()).not.toContain(WORKFLOWS);
      // The project's config file switches workflows on, and the assistant:
      // the host's config is over it, so the assistant stays off.
      writeFileSync(
        join(project, "powerhouse.config.json"),
        JSON.stringify({
          workflows: { enabled: true },
          connect: { ai: { assistantEnabled: true } },
        }),
      );
      expect(modules()).toContain(WORKFLOWS);
      expect(modules()).not.toContain(ASSISTANT);
    } finally {
      cwd.mockRestore();
      rmSync(project, { recursive: true, force: true });
    }
  });

  it("build maps to the classic build service, with its default outDir", async () => {
    const runner = await import("../src/runners/connect.js");
    const { runConnectBuild } =
      await import("../src/services/connect-build.js");
    await runner.build(
      connect({ name: "lab-connect", runner: { module: "m" } }),
      ctx,
    );
    expect(vi.mocked(runConnectBuild).mock.calls[0][0]).toMatchObject({
      outDir: ".ph/connect-build/dist/",
    });
    // No plugins list: the build bakes no composition in. The verbs that
    // serve Connect (dev, serve) add the default one.
    expect(vi.mocked(runConnectBuild).mock.calls[0][1]).toBeUndefined();
  });

  it("build passes the host's composition for the build verb", async () => {
    const runner = await import("../src/runners/connect.js");
    const { runConnectBuild } =
      await import("../src/services/connect-build.js");
    vi.mocked(runConnectBuild).mockClear();
    await runner.build(
      {
        name: "lab-connect",
        runner: {
          module: "m",
          plugins: [
            "@powerhousedao/connect/plugins/core-only",
            { module: "./dev-tools.js", verbs: ["dev"] },
          ],
        },
      },
      { ...ctx, verb: "build" },
    );
    expect(vi.mocked(runConnectBuild).mock.calls[0][1]).toEqual({
      composition: [
        { module: "@powerhousedao/connect/plugins/core-only", config: {} },
      ],
    });
  });

  it("build bakes in the host's config, favicon included", async () => {
    const runner = await import("../src/runners/connect.js");
    const { runConnectBuild } =
      await import("../src/services/connect-build.js");
    vi.mocked(runConnectBuild).mockClear();
    await runner.build(
      {
        name: "lab-connect",
        runner: { module: "m", routes: "hosts/lab/routes" },
        config: {
          branding: { appName: "Lab", favicon: "hosts/lab/icon.svg" },
          app: { basePath: "/lab" },
        },
      },
      { ...ctx, verb: "build" },
    );
    const [, override, options] = vi.mocked(runConnectBuild).mock.calls[0];
    expect(options).toEqual({ routes: "hosts/lab/routes" });
    expect(override).toMatchObject({
      branding: { appName: "Lab", favicon: "hosts/lab/icon.svg" },
      app: { basePath: "/lab" },
    });
  });

  it("serve leaves the built favicon's path out of the served config", async () => {
    const runner = await import("../src/runners/connect.js");
    const { runConnectServer } =
      await import("@powerhousedao/ph-run/connect-server");
    vi.mocked(runConnectServer).mockClear();
    await runner.serve(
      {
        name: "lab-connect",
        runner: { module: "m" },
        config: { branding: { appName: "Lab", favicon: "icon.svg" } },
      },
      ctx,
    );
    const { connect } = vi.mocked(runConnectServer).mock.calls[0][1]!;
    expect(connect?.branding).toEqual({ appName: "Lab" });
  });

  it("serve keeps the build's images over the host's project paths", async () => {
    const { withoutBuiltImages } = await import("../src/runners/connect.js");
    const url = "https://cdn.example/logo.png";
    expect(
      withoutBuiltImages({
        branding: {
          appName: "Lab",
          icon: "./icons/app.png",
          loader: { src: "./icons/loader.png", animation: "pulse", size: 88 },
          favicon: "icon.ico",
        },
      })?.branding,
    ).toEqual({ appName: "Lab" });
    // URLs, data URIs and resets are served as given
    expect(
      withoutBuiltImages({
        branding: { icon: url, loader: { src: url, animation: "none" } },
      })?.branding,
    ).toEqual({ icon: url, loader: { src: url, animation: "none" } });
    expect(
      withoutBuiltImages({ branding: { icon: null, loader: "./l.png" } })
        ?.branding,
    ).toEqual({ icon: null });
  });

  it("dev mounts the host's routes", async () => {
    const runner = await import("../src/runners/connect.js");
    const { runConnectStudio } =
      await import("../src/services/connect-studio.js");
    vi.mocked(runConnectStudio).mockClear();
    await runner.dev(
      { name: "lab-connect", runner: { module: "m", routes: false } },
      ctx,
    );
    expect(vi.mocked(runConnectStudio).mock.calls[0][3]).toMatchObject({
      routes: false,
    });
  });

  it("hands runner.serveFiles to every server: dev, the built-in and vite preview", async () => {
    const runner = await import("../src/runners/connect.js");
    const { runConnectStudio } =
      await import("../src/services/connect-studio.js");
    const { runConnectServer } =
      await import("@powerhousedao/ph-run/connect-server");
    const { runConnectPreview } =
      await import("../src/services/connect-preview.js");
    const serveFiles = { "/studio.config.json": "/u/.ph/studio.config.json" };
    const host = connect({
      name: "lab-connect",
      runner: { module: "m", serveFiles },
    });
    for (const service of [
      runConnectStudio,
      runConnectServer,
      runConnectPreview,
    ]) {
      vi.mocked(service).mockClear();
    }
    await runner.dev(host, ctx);
    expect(vi.mocked(runConnectStudio).mock.calls[0][3]).toMatchObject({
      serveFiles,
    });
    await runner.serve(host, ctx);
    expect(vi.mocked(runConnectServer).mock.calls[0][3]).toEqual({
      proxy: undefined,
      serveFiles,
    });
    vi.stubEnv("PH_CONNECT_SERVER", "vite");
    await runner.serve(host, ctx);
    vi.unstubAllEnvs();
    expect(vi.mocked(runConnectPreview).mock.calls[0][3]).toEqual({
      proxy: undefined,
      serveFiles,
    });
    // Without the key, no server is handed any.
    vi.mocked(runConnectServer).mockClear();
    await runner.serve(connect({ name: "lab", runner: { module: "m" } }), ctx);
    expect(vi.mocked(runConnectServer).mock.calls[0][3]).toEqual({
      proxy: undefined,
    });
  });
});

describe("connect bridge runner — structural multi-reactor (P4.2/P4.3)", () => {
  it("a remote backend next to a local one activates routing: reactorClient + drives", async () => {
    const runner = await import("../src/runners/connect.js");
    const { runConnectStudio } =
      await import("../src/services/connect-studio.js");
    vi.mocked(runConnectStudio).mockClear();
    await runner.dev(
      connect({
        name: "lab-connect",
        runner: { module: "m" },
        config: {
          // the scaffold default that must NOT veto declared structure:
          instance: {
            namespace: null,
            reactorWorker: false,
            multiReactor: false,
          },
          drives: {
            defaultDrives: [
              { url: "http://existing/d/kept", name: null, icon: null },
            ],
          },
        },
        reactor: {
          backends: {
            local: { kind: "worker" },
            main: {
              kind: "remote",
              remote: { url: "http://localhost:7064/d/drive" },
            },
          },
        },
      }),
      ctx,
    );
    const override = handed(
      vi.mocked(runConnectStudio).mock.calls[0][2],
    ) as PHConnectRuntimeConfigLike;
    expect(override.instance).toMatchObject({
      reactorClient: "router", // structure beats the scaffold-default false
      reactorWorker: true, // the browser reactor's kind
      remoteBackends: [{ name: "main", url: "http://localhost:7064/d/drive" }],
    });
    // the home drive first, annotated with the backend serving it
    expect(override.drives?.defaultDrives?.[0]).toEqual({
      url: "http://localhost:7064/d/drive",
      name: null,
      icon: null,
      backend: "main",
    });
    expect(override.drives?.defaultDrives?.[1]).toEqual({
      url: "http://existing/d/kept",
      name: null,
      icon: null,
    });
    expect(override.instance).not.toHaveProperty("collections");
  });

  const linked = (reactor: ConnectHost["reactor"]) =>
    connect({ name: "lab-connect", runner: { module: "m" }, reactor });
  const served = async (host: ReturnType<typeof connect>) => {
    const runner = await import("../src/runners/connect.js");
    const { runConnectStudio } =
      await import("../src/services/connect-studio.js");
    vi.mocked(runConnectStudio).mockClear();
    await runner.dev(host, ctx);
    return handed(
      vi.mocked(runConnectStudio).mock.calls[0][2],
    ) as PHConnectRuntimeConfigLike;
  };
  const sb = (url: string) => ({ kind: "remote" as const, remote: { url } });

  it("serves a remote-only Connect its switchboard", async () => {
    const override = await served(
      linked({ backends: { sb: sb("http://localhost:4001/d/b") } }),
    );
    expect(override.instance).toMatchObject({
      reactorClient: "remote",
      remoteBackends: [{ name: "sb", url: "http://localhost:4001/d/b" }],
    });
  });

  it("names a remote drive only when the host does", async () => {
    const override = await served(
      linked({
        backends: { main: { kind: "worker" } },
        drives: [
          { slug: "d", remote: { url: "http://localhost:4001/d/d" } },
          {
            slug: "e",
            name: "Shared",
            remote: { url: "http://localhost:4001/d/e" },
          },
        ],
      }),
    );
    // Connect writes a default drive's name into the drive itself.
    expect(override.drives?.defaultDrives?.map((d) => d.name)).toEqual([
      undefined,
      "Shared",
    ]);
  });

  it("serves one backend per switchboard, each drive with its own", async () => {
    const override = await served(
      linked({
        backends: {
          main: { kind: "worker" },
          sb: sb("http://localhost:4001/d/b"),
          other: sb("http://localhost:4002/d/c"),
        },
        drives: [
          { slug: "d", remote: { url: "http://localhost:4001/d/d" } },
          { slug: "e", remote: { url: "http://localhost:4002/d/e" } },
        ],
      }),
    );
    expect(override.instance?.remoteBackends).toEqual([
      { name: "sb", url: "http://localhost:4001/d/b" },
      { name: "other", url: "http://localhost:4002/d/c" },
    ]);
    expect(
      override.drives?.defaultDrives?.map((d) => [d.url, d.backend, d.sync]),
    ).toEqual([
      ["http://localhost:4001/d/b", "sb", undefined],
      ["http://localhost:4002/d/c", "other", undefined],
      ["http://localhost:4001/d/d", "sb", undefined],
      ["http://localhost:4002/d/e", "other", undefined],
    ]);
  });

  it("keeps no local copy of a drive placed on its switchboard", async () => {
    const override = await served(
      linked({
        backends: {
          main: { kind: "worker" },
          sb: sb("http://localhost:4001/d/b"),
        },
        drives: [{ slug: "c", remote: { url: "http://localhost:4001/d/c" } }],
        placement: { drives: { b: "sb" } },
      }),
    );
    expect(
      override.drives?.defaultDrives?.map((d) => [d.url, d.backend, d.sync]),
    ).toEqual([
      ["http://localhost:4001/d/b", "sb", false], // placed: no copy
      ["http://localhost:4001/d/c", "sb", undefined], // unplaced: synced
    ]);
  });

  it("serves a placed drive that is no default drive as a collection", async () => {
    const override = await served(
      linked({
        backends: {
          main: { kind: "worker" },
          sb: sb("http://localhost:4001/d/b"),
        },
        placement: { drives: { b: "sb", workflows: "sb" } },
      }),
    );
    expect(override.instance?.collections).toEqual({
      workflows: { backend: "sb", sync: false },
    });
  });

  it("writes the switchboard as ${origin} behind the proxy", async () => {
    const override = await served(
      connect({
        name: "lab-connect",
        runner: { module: "m", proxy: { target: "http://localhost:4001" } },
        reactor: {
          backends: {
            main: { kind: "worker" },
            sb: sb("http://localhost:4001/d/b"),
          },
          placement: { drives: { b: "sb" } },
        },
      }),
    );
    expect(override.instance?.remoteBackends).toEqual([
      { name: "sb", url: "${origin}/d/b" },
    ]);
    expect(override.drives?.defaultDrives?.[0]).toMatchObject({
      url: "${origin}/d/b",
      backend: "sb",
      sync: false,
    });
  });

  it("a single local backend stays single-reactor (no multiReactor, drives untouched)", async () => {
    const runner = await import("../src/runners/connect.js");
    const { runConnectStudio } =
      await import("../src/services/connect-studio.js");
    vi.mocked(runConnectStudio).mockClear();
    await runner.dev(
      connect({
        name: "lab-connect",
        runner: { module: "m" },
        config: {
          instance: {
            namespace: null,
            reactorWorker: false,
            multiReactor: false,
          },
        },
        reactor: { backends: { local: { kind: "in-process" } } },
      }),
      ctx,
    );
    const override = handed(
      vi.mocked(runConnectStudio).mock.calls[0][2],
    ) as PHConnectRuntimeConfigLike;
    expect(override.instance?.multiReactor).toBe(false);
    expect(override.drives).toBeUndefined();
  });
});

interface PHConnectRuntimeConfigLike {
  instance?: {
    multiReactor?: boolean;
    reactorWorker?: boolean;
    reactorClient?: string;
    remoteBackends?: { name: string; url: string }[];
    collections?: Record<string, { backend: string; sync?: boolean }>;
  };
  drives?: {
    defaultDrives?: {
      url?: string;
      name?: string | null;
      backend?: string;
      sync?: boolean;
    }[];
  };
}

describe("connect bridge runner — reactor projection (P2.5)", () => {
  it("serves the Renown instance from the env on a host that sets nothing else", async () => {
    const runner = await import("../src/runners/connect.js");
    const { runConnectStudio } =
      await import("../src/services/connect-studio.js");
    vi.mocked(runConnectStudio).mockClear();
    await runner.dev(
      connect({ name: "lab-connect", runner: { module: "m", port: 6599 } }),
      { ...ctx, env: { RENOWN_URL: "https://renown.test" } },
    );
    const override = handed(vi.mocked(runConnectStudio).mock.calls[0][2]);
    expect(override).toMatchObject({
      renown: { url: "https://renown.test" },
    });
  });

  it("serves a reactor namespace on a host that sets nothing else", async () => {
    const runner = await import("../src/runners/connect.js");
    const { runConnectStudio } =
      await import("../src/services/connect-studio.js");
    vi.mocked(runConnectStudio).mockClear();
    await runner.dev(
      connect({
        name: "lab-connect",
        runner: { module: "m", port: 6599 },
        reactor: { namespace: "copy-1" },
      }),
      ctx,
    );
    const override = handed(vi.mocked(runConnectStudio).mock.calls[0][2]);
    expect(override).toMatchObject({ instance: { namespace: "copy-1" } });
  });

  it("merges protocol → connect.reactor into the caller override", async () => {
    const runner = await import("../src/runners/connect.js");
    const { runConnectStudio } =
      await import("../src/services/connect-studio.js");
    vi.mocked(runConnectStudio).mockClear();
    await runner.dev(
      connect({
        name: "lab-connect",
        runner: { module: "m", port: 6599 },
        config: { branding: { appName: "Lab" } },
        reactor: {
          backends: { local: { kind: "worker" } },
          protocol: { createSignaturePolicy: "legacy" },
        },
      }),
      ctx,
    );
    const override = handed(vi.mocked(runConnectStudio).mock.calls[0][2]);
    expect(override).toMatchObject({
      branding: { appName: "Lab" },
      reactor: { createSignaturePolicy: "legacy" },
      instance: { reactorWorker: true },
    });
  });
});

describe("runner arguments (ctx.argv) win over the host file", () => {
  const withArgv = (...argv: string[]): RunnerContext => ({ ...ctx, argv });

  it("the switchboard runner declares the classic flags it accepts", async () => {
    const runner = await import("../src/runners/switchboard.js");
    expect(runner.argsSchema).toEqual({
      options: [
        "--port",
        "--db-path",
        "--https-key-file",
        "--https-cert-file",
        "--remote-drives",
        "--remote-drive",
      ],
      flags: ["--strictPort", "--https", "--interactive", "--yes", "-y"],
      memberOptions: { "--switchboard-port": "--port" },
      retired: {
        "--watch": "it is no longer needed.",
        "-w": "it is no longer needed.",
        "--disable-connect": "use `ph run switchboard dev` instead.",
      },
    });
  });

  it("the connect runner declares the classic flags it accepts", async () => {
    const runner = await import("../src/runners/connect.js");
    expect(runner.argsSchema).toEqual({
      options: ["--port", "--host", "--base", "--packages-registry"],
      flags: ["--open", "--cors", "--strictPort"],
      memberOptions: { "--connect-port": "--port" },
      retired: {
        "--watch": "it is no longer needed.",
        "-w": "it is no longer needed.",
      },
    });
  });

  it("switchboard: --port, --db-path, --strictPort, --https and --remote-drives", async () => {
    const runner = await import("../src/runners/switchboard.js");
    const { startSwitchboard } =
      await import("@powerhousedao/ph-run/switchboard");
    const host = switchboard({
      name: "lab-switchboard",
      runner: {
        module: "@powerhousedao/ph-cli/runners/switchboard",
        port: 7599,
        strictPort: false,
      },
    });
    vi.mocked(startSwitchboard).mockClear();
    await runner.run(
      host,
      withArgv(
        "--port",
        "4001",
        "--db-path=./store",
        "--strictPort",
        "--https",
        "--remote-drives",
        "http://remote.test/d/one",
      ),
    );
    expect(vi.mocked(startSwitchboard).mock.calls[0][0]).toMatchObject({
      port: 4001,
      dbPath: "./store",
      strictPort: true,
      https: true,
      remoteDrives: ["http://remote.test/d/one"],
    });
  });

  it("switchboard: runner.strictPort holds without the flag, and no flag leaves the classic call as it was", async () => {
    const runner = await import("../src/runners/switchboard.js");
    const { startSwitchboard } =
      await import("@powerhousedao/ph-run/switchboard");
    vi.mocked(startSwitchboard).mockClear();
    await runner.run(
      switchboard({
        name: "lab-switchboard",
        runner: { module: "m", port: 7599, strictPort: true },
      }),
      ctx,
    );
    await runner.run(
      switchboard({ name: "lab-switchboard", runner: { module: "m" } }),
      ctx,
    );
    const [strict, plain] = vi
      .mocked(startSwitchboard)
      .mock.calls.map((call) => call[0]);
    expect(strict).toMatchObject({ port: 7599, strictPort: true });
    expect(plain).not.toHaveProperty("strictPort");
  });

  it("switchboard: a value the classic definition refuses fails, naming the host file", async () => {
    const runner = await import("../src/runners/switchboard.js");
    const host = switchboard({
      name: "lab-switchboard",
      runner: { module: "m", port: 7599 },
    });
    await expect(
      runner.run(host, withArgv("--port", "not-a-number")),
    ).rejects.toThrow(/hosts\/lab-switchboard\/host\.js: /);
  });

  it("connect dev: --port, --host, --open, --strictPort and --cors", async () => {
    const runner = await import("../src/runners/connect.js");
    const { runConnectStudio } =
      await import("../src/services/connect-studio.js");
    vi.mocked(runConnectStudio).mockClear();
    const handle = await runner.dev(
      connect(connectHost()),
      withArgv(
        "--port",
        "4100",
        "--host",
        "0.0.0.0",
        "--open",
        "--strictPort",
        "--cors",
      ),
    );
    expect(vi.mocked(runConnectStudio).mock.calls[0][0]).toMatchObject({
      port: 4100,
      host: "0.0.0.0",
      open: true,
      strictPort: true,
      cors: true,
    });
    expect(handle.outputs.origin).toBe("http://localhost:4100");
  });

  it("connect serve: --port and --strictPort reach the built-in server, --open takes vite", async () => {
    const runner = await import("../src/runners/connect.js");
    const { runConnectServer } =
      await import("@powerhousedao/ph-run/connect-server");
    const { runConnectPreview } =
      await import("../src/services/connect-preview.js");
    vi.mocked(runConnectServer).mockClear();
    vi.mocked(runConnectPreview).mockClear();
    await runner.serve(
      connect(connectHost()),
      withArgv("--port=4200", "--strictPort"),
    );
    expect(runConnectPreview).not.toHaveBeenCalled();
    expect(vi.mocked(runConnectServer).mock.calls[0][0]).toMatchObject({
      port: 4200,
      strictPort: true,
      open: false,
    });

    await runner.serve(connect(connectHost()), withArgv("--open"));
    expect(runConnectPreview).toHaveBeenCalledOnce();
    expect(vi.mocked(runConnectPreview).mock.calls[0][0]).toMatchObject({
      port: 6599,
      open: true,
    });
  });

  it("connect build: --base and --packages-registry reach the build service", async () => {
    const runner = await import("../src/runners/connect.js");
    const { runConnectBuild } =
      await import("../src/services/connect-build.js");
    vi.mocked(runConnectBuild).mockClear();
    await runner.build(
      connect({ name: "lab-connect", runner: { module: "m" } }),
      withArgv("--base", "/app", "--packages-registry=https://registry.test"),
    );
    const [args, override] = vi.mocked(runConnectBuild).mock.calls[0];
    expect(args).toMatchObject({
      connectBasePath: "/app",
      packagesRegistry: "https://registry.test",
      outDir: ".ph/connect-build/dist/",
    });
    // Over the host's config, as the flag was over powerhouse.config.json.
    expect(override).toEqual({ app: { basePath: "/app" } });
  });

  it("each connect verb refuses the arguments of another", async () => {
    const runner = await import("../src/runners/connect.js");
    const host = connect({ name: "lab-connect", runner: { module: "m" } });
    await expect(
      runner.build(host, withArgv("--port", "4100")),
    ).rejects.toThrow(/hosts\/lab-connect\/host\.js: /);
    await expect(runner.dev(host, withArgv("--base", "/app"))).rejects.toThrow(
      /hosts\/lab-connect\/host\.js: /,
    );
    await expect(
      runner.serve(host, withArgv("--packages-registry", "x")),
    ).rejects.toThrow(/hosts\/lab-connect\/host\.js: /);
  });
});

/** THE PARITY GATE for the Connect runner and the switchboard's `build`, as
 * the switchboard's `run` has above: the FULL argument object, key for key
 * (strict), equals the classic command's with only the keys the host file
 * and the invocation own laid over it. */
describe("the runners hand the services the classic argument shape", () => {
  const withArgv = (...argv: string[]): RunnerContext => ({ ...ctx, argv });

  it("connect dev: the classic studio args, restarting on a config change", async () => {
    const runner = await import("../src/runners/connect.js");
    const { runConnectStudio } =
      await import("../src/services/connect-studio.js");
    const { connectStudioServiceArgs } =
      await import("../src/services/service-args.js");
    const classic = await connectStudioServiceArgs();
    // sanity on the classic shape this gate compares against
    expect(classic).toMatchObject({
      port: 3000,
      printUrls: true,
      bindCLIShortcuts: true,
    });
    expect(classic).toHaveProperty("host", undefined);

    vi.mocked(runConnectStudio).mockClear();
    await runner.dev(connect(connectHost()), ctx);
    const [args, , , options] = vi.mocked(runConnectStudio).mock.calls[0];
    expect(args).toStrictEqual({
      ...classic,
      port: 6599,
      open: false,
      strictPort: false,
      // The runner's terminal belongs to `ph run`, not to vite's shortcuts.
      bindCLIShortcuts: false,
    });
    expect(options).toStrictEqual({
      routes: undefined,
      cacheDir: join(ctx.projectRoot, "node_modules", ".vite-lab-connect"),
      proxy: undefined,
      // As `ph connect studio` and `ph vetra` start Studio.
      reloadOnConfigChange: true,
      restartWith: expect.any(Function) as unknown,
      exposeStop: expect.any(Function) as unknown,
    });
  });

  it("connect dev: this invocation's arguments over the classic ones", async () => {
    const runner = await import("../src/runners/connect.js");
    const { runConnectStudio } =
      await import("../src/services/connect-studio.js");
    const { connectStudioServiceArgs } =
      await import("../src/services/service-args.js");
    vi.mocked(runConnectStudio).mockClear();
    await runner.dev(
      connect(connectHost()),
      withArgv("--port", "4100", "--host", "0.0.0.0", "--cors"),
    );
    expect(vi.mocked(runConnectStudio).mock.calls[0][0]).toStrictEqual({
      ...(await connectStudioServiceArgs()),
      port: 4100,
      host: "0.0.0.0",
      open: false,
      strictPort: false,
      cors: true,
      bindCLIShortcuts: false,
    });
  });

  it("connect dev: the handle stops Studio, not only the first server", async () => {
    const runner = await import("../src/runners/connect.js");
    const { runConnectStudio } =
      await import("../src/services/connect-studio.js");
    type StudioServer = Awaited<ReturnType<typeof runConnectStudio>>;

    // A config change may have replaced the first server by the time the
    // handle shuts down: Studio's own stop closes whichever is current.
    const first = fakeVite("http://localhost:6599/");
    const stop = vi.fn().mockResolvedValue(undefined);
    vi.mocked(runConnectStudio).mockImplementationOnce(
      (_args, _logger, _override, options) => {
        options?.exposeStop?.(stop);
        return Promise.resolve(first as unknown as StudioServer);
      },
    );
    const handle = await runner.dev(connect(connectHost()), ctx);
    expect(handle.outputs.origin).toBe("http://localhost:6599");
    await handle.shutdown();
    await handle.shutdown();
    expect(stop).toHaveBeenCalledOnce();
    expect(first.close).not.toHaveBeenCalled();
  });

  it("connect dev: a restarted server is started as the first is, under a compound", async () => {
    const runner = await import("../src/runners/connect.js");
    const { runConnectStudio } =
      await import("../src/services/connect-studio.js");
    type StudioServer = Awaited<ReturnType<typeof runConnectStudio>>;
    const restarted = fakeVite(
      "http://localhost:6599/",
    ) as unknown as StudioServer;
    const viteExit = () => undefined;
    const start = () => {
      process.once("SIGTERM", viteExit);
      return Promise.resolve(restarted);
    };
    const restartWithOf = async (context: RunnerContext) => {
      vi.mocked(runConnectStudio).mockClear();
      await runner.dev(connect(connectHost()), context);
      const restartWith =
        vi.mocked(runConnectStudio).mock.calls[0][3]?.restartWith;
      if (!restartWith) throw new Error("dev passed no restartWith");
      return restartWith;
    };

    const underCompound = await restartWithOf({
      ...ctx,
      parent: { host: "desktop", verb: "run" },
    });
    expect(await underCompound(start)).toBe(restarted);
    // The compound owns the exit: vite's exit-on-SIGTERM listener is dropped.
    expect(process.listeners("SIGTERM")).not.toContain(viteExit);

    const standalone = await restartWithOf(ctx);
    expect(await standalone(start)).toBe(restarted);
    expect(process.listeners("SIGTERM")).toContain(viteExit);
    process.off("SIGTERM", viteExit);
  });

  it("connect build: the classic build args, with the host's outDir over them", async () => {
    const runner = await import("../src/runners/connect.js");
    const { runConnectBuild } =
      await import("../src/services/connect-build.js");
    const { connectBuildServiceArgs } =
      await import("../src/services/service-args.js");
    const classic = await connectBuildServiceArgs();
    expect(classic).toMatchObject({ outDir: ".ph/connect-build/dist/" });

    vi.mocked(runConnectBuild).mockClear();
    await runner.build(
      connect({ name: "lab-connect", runner: { module: "m" } }),
      ctx,
    );
    await runner.build(
      connect({
        name: "lab-connect",
        runner: { module: "m", outDir: "build-out" },
      }),
      ctx,
    );
    const [plain, withOutDir] = vi
      .mocked(runConnectBuild)
      .mock.calls.map((call) => call[0]);
    expect(plain).toStrictEqual(classic);
    expect(withOutDir).toStrictEqual({ ...classic, outDir: "build-out" });
  });

  it("connect serve: the classic preview args, with the host's keys over them", async () => {
    const runner = await import("../src/runners/connect.js");
    const { runConnectServer } =
      await import("@powerhousedao/ph-run/connect-server");
    const { connectPreviewServiceArgs } =
      await import("@powerhousedao/ph-run/service-args");
    const classic = await connectPreviewServiceArgs();
    expect(classic).toMatchObject({
      port: 4173,
      outDir: ".ph/connect-build/dist/",
      printUrls: true,
    });

    vi.mocked(runConnectServer).mockClear();
    await runner.serve(
      connect({ name: "lab-connect", runner: { module: "m" } }),
      ctx,
    );
    await runner.serve(
      connect({
        name: "lab-connect",
        runner: { module: "m", port: 8099, outDir: "build-out" },
      }),
      withArgv("--strictPort"),
    );
    const [plain, withKeys] = vi
      .mocked(runConnectServer)
      .mock.calls.map((call) => call[0]);
    const served = {
      ...classic,
      // Where the host's Studio answers, not `ph connect preview`'s default.
      port: 3000,
      open: false,
      strictPort: false,
      cors: true,
      bindCLIShortcuts: false,
      host: "127.0.0.1",
    };
    expect(plain).toStrictEqual(served);
    expect(withKeys).toStrictEqual({
      ...served,
      port: 8099,
      outDir: "build-out",
      strictPort: true,
    });
  });

  it("switchboard build: the classic `ph build` args, with the host's outDir over them", async () => {
    const runner = await import("../src/runners/switchboard.js");
    const { runBuild } = await import("../src/services/build.js");
    const { buildServiceArgs } =
      await import("../src/services/service-args.js");
    const classic = await buildServiceArgs();
    expect(classic).toMatchObject({ outDir: "dist", release: false });

    vi.mocked(runBuild).mockClear();
    await runner.build(
      switchboard({ name: "lab-switchboard", runner: { module: "m" } }),
      ctx,
    );
    await runner.build(
      switchboard({
        name: "lab-switchboard",
        runner: { module: "m", outDir: "out" },
      }),
      ctx,
    );
    // The whole call: no options, as the verb has no process to own.
    expect(vi.mocked(runBuild).mock.calls).toStrictEqual([
      [classic],
      [{ ...classic, outDir: "out" }],
    ]);
  });
});

/** Connect has no https option on the classic path, so its runner declares
 * none (see the `argsSchema` expectation above); `ph vetra`'s three belong
 * to its switchboard, and reach it as they do there. */
describe("https reaches the switchboard, from the arguments and the host file", () => {
  it("--https-key-file and --https-cert-file are carried as `ph switchboard` carries them", async () => {
    const runner = await import("../src/runners/switchboard.js");
    const { startSwitchboard } =
      await import("@powerhousedao/ph-run/switchboard");
    vi.mocked(startSwitchboard).mockClear();
    await runner.run(
      switchboard({ name: "lab-switchboard", runner: { module: "m" } }),
      {
        ...ctx,
        argv: [
          "--https",
          "--https-key-file",
          "certs/key.pem",
          "--https-cert-file=certs/cert.pem",
        ],
      },
    );
    expect(vi.mocked(startSwitchboard).mock.calls[0][0]).toMatchObject({
      https: true,
      httpsKeyFile: "certs/key.pem",
      httpsCertFile: "certs/cert.pem",
    });
  });

  it("the host file's form is the member's own config.switchboard.server.https", async () => {
    const runner = await import("../src/runners/switchboard.js");
    const { startSwitchboard } =
      await import("@powerhousedao/ph-run/switchboard");
    vi.mocked(startSwitchboard).mockClear();
    await runner.run(
      switchboard({
        name: "lab-switchboard",
        runner: { module: "m" },
        config: {
          switchboard: {
            server: {
              https: { keyPath: "certs/key.pem", certPath: "certs/cert.pem" },
            },
          },
        },
      }),
      ctx,
    );
    const [args, , member] = vi.mocked(startSwitchboard).mock.calls[0];
    // No flag: the args carry none, and the member's config holds.
    expect(args).toHaveProperty("https", undefined);
    expect(member).toMatchObject({
      server: {
        https: { keyPath: "certs/key.pem", certPath: "certs/cert.pem" },
      },
    });
  });
});
