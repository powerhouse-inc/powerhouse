import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { HostDefinition, RunnerContext } from "@powerhousedao/host-core";

/** The bridges must call the SAME services the classic commands call — these
 * tests pin the host→args mapping, not the services themselves. */

vi.mock("../src/services/connect-studio.js", () => ({
  runConnectStudio: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../src/services/switchboard.js", () => ({
  // the real service returns the server handle; workflows off in these tests
  startSwitchboard: vi.fn().mockResolvedValue({ workflowsEnabled: false }),
}));
vi.mock("../src/services/connect-preview.js", () => ({
  runConnectPreview: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../src/services/connect-build.js", () => ({
  runConnectBuild: vi.fn().mockResolvedValue(undefined),
}));

const ctx: RunnerContext = { projectRoot: "/lab", verb: "run", env: {} };

const connectHost = (over: Partial<HostDefinition> = {}): HostDefinition => ({
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

    await runner.dev(connectHost(), ctx);
    const [args, logger, callerOverride] =
      vi.mocked(runConnectStudio).mock.calls[0];
    expect(args).toMatchObject({ port: 6599, open: false, printUrls: true });
    expect(logger).toBeUndefined();
    expect(callerOverride).toEqual({ branding: { appName: "Lab" } });
  });

  it("run is dev-studio in phase 0; defaults apply without runner.port", async () => {
    const runner = await import("../src/runners/connect.js");
    const { runConnectStudio } =
      await import("../src/services/connect-studio.js");
    vi.mocked(runConnectStudio).mockClear();
    await runner.run(
      connectHost({ runner: { module: "m", openBrowser: true } }),
      ctx,
    );
    expect(vi.mocked(runConnectStudio).mock.calls[0][0]).toMatchObject({
      port: 3000,
      open: true,
    });
  });

  it("rejects a host without a name", async () => {
    const runner = await import("../src/runners/connect.js");
    expect(
      runner.hostSchema.safeParse({ runner: { module: "m" } }).success,
    ).toBe(false);
  });
});

describe("switchboard bridge runner", () => {
  it("maps run → production and dev → dev loader", async () => {
    const runner = await import("../src/runners/switchboard.js");
    const { startSwitchboard } = await import("../src/services/switchboard.js");
    const host: HostDefinition = {
      name: "lab-switchboard",
      runner: {
        module: "@powerhousedao/ph-cli/runners/switchboard",
        port: 7599,
      },
    };

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

  it("projects reactor.protocol + storage into env, and dbPath into args (P2.4)", async () => {
    const runner = await import("../src/runners/switchboard.js");
    const { startSwitchboard } = await import("../src/services/switchboard.js");
    vi.mocked(startSwitchboard).mockClear();
    const saved = {
      REACTOR_DOCUMENT_DECISIONS: process.env.REACTOR_DOCUMENT_DECISIONS,
      PH_REACTOR_DATABASE_URL: process.env.PH_REACTOR_DATABASE_URL,
    };
    delete process.env.REACTOR_DOCUMENT_DECISIONS;
    delete process.env.PH_REACTOR_DATABASE_URL;
    // a real, writable path: the projection mkdirs a path-storage dataDir
    // before boot ("/data/pg" EACCESed on Linux CI)
    const dataDir = mkdtempSync(join(tmpdir(), "ph-bridge-datadir-"));
    try {
      await runner.run(
        {
          name: "lab-switchboard",
          runner: { module: "m", port: 7599 },
          reactor: {
            backends: {
              main: {
                storage: { kind: "path", dataDir },
                readModel: { url: "dev.db" },
              },
            },
            protocol: { featureFlags: { documentDecisions: true } },
          },
        },
        ctx,
      );
      expect(process.env.REACTOR_DOCUMENT_DECISIONS).toBe("true");
      expect(process.env.PH_REACTOR_DATABASE_URL).toBe(dataDir);
      expect(vi.mocked(startSwitchboard).mock.calls[0][0]).toMatchObject({
        dbPath: "dev.db",
      });
    } finally {
      process.env.REACTOR_DOCUMENT_DECISIONS = saved.REACTOR_DOCUMENT_DECISIONS;
      process.env.PH_REACTOR_DATABASE_URL = saved.PH_REACTOR_DATABASE_URL;
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it("fails loudly when a pre-set env contradicts reactor.protocol (P2.6)", async () => {
    const runner = await import("../src/runners/switchboard.js");
    process.env.REACTOR_AUTH_ENFORCEMENT = "true";
    try {
      await expect(
        runner.run(
          {
            name: "lab-switchboard",
            runner: { module: "m" },
            reactor: { protocol: { featureFlags: { authEnforcement: false } } },
          },
          ctx,
        ),
      ).rejects.toThrow(
        /reactor\.protocol conflict.*REACTOR_AUTH_ENFORCEMENT/s,
      );
    } finally {
      delete process.env.REACTOR_AUTH_ENFORCEMENT;
    }
  });
});

describe("connect bridge runner — serve/build verbs (P3.3)", () => {
  it("serve maps to the classic preview service with runner options", async () => {
    const runner = await import("../src/runners/connect.js");
    const { runConnectPreview } =
      await import("../src/services/connect-preview.js");
    await runner.serve(
      {
        name: "lab-connect",
        runner: { module: "m", port: 8099, outDir: "build-out" },
      },
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
    await runner.build({ name: "lab-connect", runner: { module: "m" } }, ctx);
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

  it("dev mounts the host's routes", async () => {
    const runner = await import("../src/runners/connect.js");
    const { runConnectStudio } =
      await import("../src/services/connect-studio.js");
    vi.mocked(runConnectStudio).mockClear();
    await runner.dev(
      { name: "lab-connect", runner: { module: "m", routes: false } },
      ctx,
    );
    expect(vi.mocked(runConnectStudio).mock.calls[0][3]).toEqual({
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
      {
        name: "lab-connect",
        runner: { module: "m" },
        config: {
          // the scaffold default that must NOT veto declared structure:
          instance: { reactorWorker: false, multiReactor: false },
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
      },
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
      {
        name: "lab-connect",
        runner: { module: "m" },
        config: { instance: { multiReactor: false } },
        reactor: { backends: { local: { kind: "in-process" } } },
      },
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
      {
        name: "lab-connect",
        runner: { module: "m", port: 6599 },
        config: { branding: { appName: "Lab" } },
        reactor: {
          backends: { local: { kind: "worker" } },
          workflows: true,
          protocol: { createSignaturePolicy: "legacy" },
        },
      },
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
