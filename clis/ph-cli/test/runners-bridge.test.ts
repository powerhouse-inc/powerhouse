import { describe, expect, it, vi } from "vitest";
import type { HostDefinition, RunnerContext } from "@powerhousedao/host-core";

/** The bridges must call the SAME services the classic commands call — these
 * tests pin the host→args mapping, not the services themselves. */

vi.mock("../src/services/connect-studio.js", () => ({
  runConnectStudio: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../src/services/switchboard.js", () => ({
  startSwitchboard: vi.fn().mockResolvedValue(undefined),
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

    await runner.run(host, ctx);
    expect(vi.mocked(startSwitchboard).mock.calls[0][0]).toMatchObject({
      port: 7599,
      dev: false,
      mcp: true,
      useVetraDrive: false,
      remoteDrives: [],
    });

    await runner.dev(host, ctx);
    expect(vi.mocked(startSwitchboard).mock.calls[1][0]).toMatchObject({
      port: 7599,
      dev: true,
    });
  });

  it("has no build verb — honest absence", async () => {
    const runner = await import("../src/runners/switchboard.js");
    expect("build" in runner).toBe(false);
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
    try {
      await runner.run(
        {
          name: "lab-switchboard",
          runner: { module: "m", port: 7599 },
          reactor: {
            backends: {
              main: {
                storage: { kind: "path", dataDir: "/data/pg" },
                readModel: { url: "dev.db" },
              },
            },
            protocol: { featureFlags: { documentDecisions: true } },
          },
        },
        ctx,
      );
      expect(process.env.REACTOR_DOCUMENT_DECISIONS).toBe("true");
      expect(process.env.PH_REACTOR_DATABASE_URL).toBe("/data/pg");
      expect(vi.mocked(startSwitchboard).mock.calls[0][0]).toMatchObject({
        dbPath: "dev.db",
      });
    } finally {
      process.env.REACTOR_DOCUMENT_DECISIONS = saved.REACTOR_DOCUMENT_DECISIONS;
      process.env.PH_REACTOR_DATABASE_URL = saved.PH_REACTOR_DATABASE_URL;
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

  it("build maps to the classic build service (outDir default dist)", async () => {
    const runner = await import("../src/runners/connect.js");
    const { runConnectBuild } =
      await import("../src/services/connect-build.js");
    await runner.build({ name: "lab-connect", runner: { module: "m" } }, ctx);
    expect(vi.mocked(runConnectBuild).mock.calls[0][0]).toMatchObject({
      outDir: "dist",
    });
  });
});

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
