import type {
  PHConnectDefaultDrive,
  PHConnectRuntimeConfig,
} from "@powerhousedao/shared/clis";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ConnectStudioArgs } from "../src/types.js";
import { buildStudioConnectOverride } from "../src/utils/cli-connect-override.js";

function mk(partial: Partial<ConnectStudioArgs>): ConnectStudioArgs {
  // Minimal stub — covers the commonArgs fields buildStudioConnectOverride
  // reads. They carry cmd-ts defaults at runtime; the explicit-set gating
  // (which inspects process.argv) decides whether they reach the override.
  return {
    connectBasePath: "/",
    logLevel: "info",
    defaultDrivesUrl: "",
    drivesPreserveStrategy: "preserve-by-url-and-detach",
    renownNamespace: undefined,
    ...partial,
  } as ConnectStudioArgs;
}

const vetraDrive: PHConnectDefaultDrive = {
  url: "http://localhost:4001/d/vetra-9e05d8b8",
  name: null,
  icon: null,
};
const dashboardDrive: PHConnectDefaultDrive = {
  url: "http://localhost:4001/d/pl-dashboard",
  name: null,
  icon: null,
};
const workflowsDrive: PHConnectDefaultDrive = {
  url: "http://localhost:4001/d/12be6c23",
  name: null,
  icon: null,
};

describe("buildStudioConnectOverride", () => {
  let originalArgv: string[];
  beforeEach(() => {
    originalArgv = process.argv;
    // Default: pretend no flags passed (commonArgs defaults shouldn't leak).
    process.argv = ["node", "cli"];
  });
  afterEach(() => {
    process.argv = originalArgv;
  });

  it("emits only studioMode when no caller override and no flags are set", () => {
    expect(buildStudioConnectOverride(mk({}), undefined)).toEqual({
      app: { studioMode: true },
    });
  });

  it("keeps the caller's default drives intact when no flag is passed", () => {
    const caller: PHConnectRuntimeConfig = {
      drives: {
        defaultDrives: [vetraDrive, dashboardDrive],
        preserveStrategy: "preserve-all",
      },
    };
    expect(buildStudioConnectOverride(mk({}), caller)).toEqual({
      app: { studioMode: true },
      drives: {
        defaultDrives: [vetraDrive, dashboardDrive],
        preserveStrategy: "preserve-all",
      },
    });
  });

  it("appends an explicit --default-drives-url to the caller's drives, deduped by URL", () => {
    process.argv = [
      "node",
      "cli",
      "--default-drives-url",
      "http://localhost:4001/d/pl-dashboard,http://localhost:4001/d/12be6c23",
    ];
    const caller: PHConnectRuntimeConfig = {
      drives: {
        defaultDrives: [vetraDrive, dashboardDrive],
        preserveStrategy: "preserve-all",
      },
    };
    const result = buildStudioConnectOverride(
      mk({
        defaultDrivesUrl:
          "http://localhost:4001/d/pl-dashboard,http://localhost:4001/d/12be6c23",
      }),
      caller,
    );
    expect(result?.drives?.defaultDrives).toEqual([
      vetraDrive,
      dashboardDrive,
      workflowsDrive,
    ]);
    // The flag does not touch the caller's preserve strategy.
    expect(result?.drives?.preserveStrategy).toBe("preserve-all");
    expect(result?.app?.studioMode).toBe(true);
  });

  it("keeps plain studio behavior when the flag is passed without a caller override", () => {
    process.argv = [
      "node",
      "cli",
      "--default-drives-url",
      "https://a.com,https://b.com",
    ];
    const result = buildStudioConnectOverride(
      mk({ defaultDrivesUrl: "https://a.com,https://b.com" }),
      undefined,
    );
    expect(result).toEqual({
      app: { studioMode: true },
      drives: {
        defaultDrives: [
          { url: "https://a.com", name: null, icon: null },
          { url: "https://b.com", name: null, icon: null },
        ],
      },
    });
  });

  it("lets an explicit --drive-preserve-strategy beat the caller's strategy", () => {
    process.argv = [
      "node",
      "cli",
      "--drive-preserve-strategy",
      "preserve-by-url-and-detach",
    ];
    const caller: PHConnectRuntimeConfig = {
      drives: {
        defaultDrives: [vetraDrive],
        preserveStrategy: "preserve-all",
      },
    };
    const result = buildStudioConnectOverride(
      mk({ drivesPreserveStrategy: "preserve-by-url-and-detach" }),
      caller,
    );
    expect(result?.drives?.preserveStrategy).toBe("preserve-by-url-and-detach");
    expect(result?.drives?.defaultDrives).toEqual([vetraDrive]);
  });

  it("merges the caller's local drives with the flag's remote drives without collision", () => {
    process.argv = [
      "node",
      "cli",
      "--default-drives-url",
      "http://localhost:4001/d/some-id",
    ];
    const caller: PHConnectRuntimeConfig = {
      drives: {
        defaultDrives: [
          { local: true, id: "some-id", name: "Local", icon: null },
        ],
        preserveStrategy: "preserve-all",
      },
    };
    const result = buildStudioConnectOverride(
      mk({ defaultDrivesUrl: "http://localhost:4001/d/some-id" }),
      caller,
    );
    expect(result?.drives?.defaultDrives).toEqual([
      { local: true, id: "some-id", name: "Local", icon: null },
      { url: "http://localhost:4001/d/some-id", name: null, icon: null },
    ]);
  });
});
