import type { PHHost, PHHostOutputs } from "@powerhousedao/host-core";
import { describe, expect, expectTypeOf, it } from "vitest";
import type { ConnectOutputs } from "../src/runners/connect.js";
import type { SwitchboardOutputs } from "../src/runners/switchboard.js";

// Type-level: the runners' PHHostRunners augmentation makes PHHost check a
// host file by its runner.module (tsc runs over this file).

const connectHost = {
  name: "lab-connect",
  runner: {
    module: "@powerhousedao/ph-cli/runners/connect",
    port: 3000,
    cspRegistrySync: true,
  },
  config: { branding: { appName: "Lab" } },
} satisfies PHHost;

const switchboardHost = {
  name: "lab-switchboard",
  runner: { module: "@powerhousedao/ph-cli/runners/switchboard", port: 4001 },
  reactor: { drives: [{ slug: "lab", name: "Lab" }] },
} satisfies PHHost;

const unknownRunnerKey = {
  name: "lab-switchboard",
  runner: {
    module: "@powerhousedao/ph-cli/runners/switchboard",
    // @ts-expect-error `cspRegistrySync` is a connect option, not a switchboard one
    cspRegistrySync: true,
  },
} satisfies PHHost;

const unknownConnectKey = {
  name: "lab-connect",
  runner: { module: "@powerhousedao/ph-cli/runners/connect" },
  // @ts-expect-error `brandng` is not a Connect config key
  config: { brandng: {} },
} satisfies PHHost;

describe("PHHostRunners augmentation", () => {
  it("types hosts and outputs by runner specifier", () => {
    expect([
      connectHost,
      switchboardHost,
      unknownRunnerKey,
      unknownConnectKey,
    ]).toHaveLength(4);
    expectTypeOf<
      PHHostOutputs<"@powerhousedao/ph-cli/runners/connect">
    >().toEqualTypeOf<ConnectOutputs>();
    expectTypeOf<
      PHHostOutputs<"@powerhousedao/ph-cli/runners/switchboard">
    >().toEqualTypeOf<SwitchboardOutputs>();
  });
});
