import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { RunnerContext } from "@powerhousedao/host-core";
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
vi.mock("../src/services/switchboard.js", () => ({
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
vi.mock("../src/services/connect-build.js", () => ({
  runConnectBuild: vi.fn().mockResolvedValue(undefined),
}));

const ctx: RunnerContext = { projectRoot: "/lab", verb: "run", env: {} };

/** Verbs receive the PARSED host, as validateHost hands it to them. */
const connect = (host: ConnectHost) => connectHostSchema.parse(host);
const switchboard = (host: SwitchboardHost) =>
  switchboardHostSchema.parse(host);

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
    expect(callerOverride).toEqual({ branding: { appName: "Lab" } });
    // Its own Vite cache: Studio and other hosts' dev servers run side by side.
    expect(vi.mocked(runConnectStudio).mock.calls[0][3]?.cacheDir).toBe(
      join(ctx.projectRoot, "node_modules", ".vite-lab-connect"),
    );
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
    expect(withoutHost).not.toHaveProperty("host");
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

      // Composing the owner silences it; a classic host (no plugins) too.
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
      await runner.dev(
        connect(connectHost({ config: { drives: { allowAddDrive: true } } })),
        { ...ctx, verb: "dev" },
      );
      expect(warn).not.toHaveBeenCalled();
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
    const { startSwitchboard } = await import("../src/services/switchboard.js");
    const host = switchboard({
      name: "lab-switchboard",
      runner: {
        module: "@powerhousedao/ph-cli/runners/switchboard",
        port: 7599,
      },
    });

    const { classicSwitchboardArgs } =
      await import("../src/services/classic-args.js");
    const classic = await classicSwitchboardArgs();
    // sanity on the classic shape this gate compares against
    expect(classic).toMatchObject({
      mcp: true,
      useVetraDrive: false,
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

  it("passes the reactor block as the member's config, writing no env (P2.4)", async () => {
    const runner = await import("../src/runners/switchboard.js");
    const { startSwitchboard } = await import("../src/services/switchboard.js");
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
    const { startSwitchboard } = await import("../src/services/switchboard.js");
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

  it("turns the plugin host on in the member's config, not the env", async () => {
    const runner = await import("../src/runners/switchboard.js");
    const { startSwitchboard } = await import("../src/services/switchboard.js");
    vi.mocked(startSwitchboard).mockClear();
    await runner.run(
      switchboard({
        name: "lab-switchboard",
        runner: { module: "m", plugins: [] },
      }),
      { ...ctx, env: { FEATURE_PLUGIN_HOST_ENABLED: "0" } },
    );
    expect(process.env.FEATURE_PLUGIN_HOST_ENABLED).toBeUndefined();
    expect(vi.mocked(startSwitchboard).mock.calls[0][2]).toMatchObject({
      features: { pluginHost: true },
    });
  });

  it("refuses a config.switchboard key the reactor block sets", () => {
    const parsed = switchboardHostSchema.safeParse({
      name: "lab-switchboard",
      runner: { module: "m" },
      reactor: { workflows: true },
      config: { switchboard: { features: { workflows: false } } },
    });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues.map((i) => i.message)).toEqual([
      "config.switchboard.features.workflows is also set by the reactor block; set it in one place.",
    ]);
  });

  it("refuses a config.switchboard key the runner or the reactor block owns", () => {
    for (const config of [
      { server: { port: 1 } },
      { drive: {} },
      { features: { pluginHost: true } },
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

  it("keeps a readModel-only block's reactor store on readModel.url, with a warning", async () => {
    const runner = await import("../src/runners/switchboard.js");
    const { startSwitchboard } = await import("../src/services/switchboard.js");
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
      await runner.run(readModelOnly, ctx);
      expect(vi.mocked(startSwitchboard).mock.calls[0][2]).toMatchObject({
        storage: {
          reactor: { url: "postgres://host/db" },
          readModel: { url: "postgres://host/db" },
        },
      });
      expect(warn).toHaveBeenCalledWith(
        expect.stringMatching(
          /readModel\.url .*also holds the reactor store.*deprecated/,
        ),
      );

      // An env var that names the store takes it, and nothing is deprecated.
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
    const { startSwitchboard } = await import("../src/services/switchboard.js");
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
    const { startSwitchboard } = await import("../src/services/switchboard.js");
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
    const { startSwitchboard } = await import("../src/services/switchboard.js");
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
  it("serve maps to the classic preview service with runner options", async () => {
    const runner = await import("../src/runners/connect.js");
    const { runConnectPreview } =
      await import("../src/services/connect-preview.js");
    await runner.serve(
      connect({
        name: "lab-connect",
        runner: { module: "m", port: 8099, outDir: "build-out" },
      }),
      ctx,
    );
    expect(vi.mocked(runConnectPreview).mock.calls[0][0]).toMatchObject({
      port: 8099,
      outDir: "build-out",
      cors: true,
      printUrls: true,
    });
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
    // No plugins list: a classic build, no composition passed.
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
    const { runConnectPreview } =
      await import("../src/services/connect-preview.js");
    vi.mocked(runConnectPreview).mockClear();
    await runner.serve(
      {
        name: "lab-connect",
        runner: { module: "m" },
        config: { branding: { appName: "Lab", favicon: "icon.svg" } },
      },
      ctx,
    );
    const { connect } = vi.mocked(runConnectPreview).mock.calls[0][1]!;
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
});

describe("connect bridge runner — structural multi-reactor (P4.2/P4.3)", () => {
  it("a remote backend next to a local one activates routing: multiReactor + drives", async () => {
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
          placement: { primary: "local" },
        },
      }),
      ctx,
    );
    const override = vi.mocked(runConnectStudio).mock
      .calls[0][2] as PHConnectRuntimeConfigLike;
    expect(override.instance).toMatchObject({
      multiReactor: true, // structure beats the scaffold-default false
      reactorWorker: true, // primary backend kind
    });
    // remote url first — it becomes defaultDrivesUrl, what the router dials
    expect(override.drives?.defaultDrives?.[0]).toMatchObject({
      url: "http://localhost:7064/d/drive",
    });
    expect(override.drives?.defaultDrives?.[1]).toMatchObject({
      url: "http://existing/d/kept",
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
    const override = vi.mocked(runConnectStudio).mock
      .calls[0][2] as PHConnectRuntimeConfigLike;
    expect(override.instance?.multiReactor).toBe(false);
    expect(override.drives).toBeUndefined();
  });
});

interface PHConnectRuntimeConfigLike {
  instance?: { multiReactor?: boolean; reactorWorker?: boolean };
  drives?: { defaultDrives?: { url?: string }[] };
}

describe("connect bridge runner — reactor projection (P2.5)", () => {
  it("merges protocol → connect.reactor and workflows into the caller override", async () => {
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
          workflows: true,
          protocol: { createSignaturePolicy: "legacy" },
        },
      }),
      ctx,
    );
    const override = vi.mocked(runConnectStudio).mock.calls[0][2];
    expect(override).toMatchObject({
      branding: { appName: "Lab" },
      reactor: { createSignaturePolicy: "legacy" },
      instance: { reactorWorker: true },
      app: { workflowsEnabled: true },
    });
  });
});
