import { describe, expect, it, vi } from "vitest";
import type { HostDefinition } from "../src/services/run/host-loader.js";
import type { RunnerContext } from "../src/services/run/runner-resolver.js";

/** The bridges must call the SAME services the classic commands call — these
 * tests pin the host→args mapping, not the services themselves. */

vi.mock("../src/services/connect-studio.js", () => ({
  runConnectStudio: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../src/services/switchboard.js", () => ({
  startSwitchboard: vi.fn().mockResolvedValue(undefined),
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
});
