import { describe, expect, it } from "vitest";
import type { PHHost, PHHostOutputs, PluginEntry } from "../src/host-types.js";

// A runner and a plugin package augment the global maps the way real ones
// will (T2); this file only exercises the type level.
declare global {
  interface PHHostRunners {
    "fake/runner": {
      host: {
        name: string;
        runner: {
          module: string;
          port?: number;
          plugins?: (string | { module: string; config?: object })[];
        };
      };
      outputs: { origin: string };
    };
  }
  interface PHPluginConfigs {
    "fake/plugin": { drive: string };
  }
}

describe("PHHost / PluginEntry type map", () => {
  it("types a host by its runner.module", () => {
    const host = {
      name: "x",
      runner: { module: "fake/runner", port: 4001 },
    } satisfies PHHost;
    const stringPort = {
      name: "x",
      runner: { module: "fake/runner" as const, port: "4001" },
    };
    // @ts-expect-error -- port must be a number for fake/runner
    const wrong: PHHost = stringPort;
    const origin: PHHostOutputs<"fake/runner">["origin"] = "http://x";
    expect([host.runner.port, wrong.name, origin]).toBeDefined();
  });

  it("types a known plugin's config and keeps unknown plugins open", () => {
    const entries: PluginEntry[] = [
      "fake/plugin",
      "third-party/plugin",
      { module: "fake/plugin", config: { drive: "http://x/d/w" } },
      { module: "third-party/plugin", verbs: ["dev"] },
    ];
    expect(entries).toHaveLength(4);
  });

  it("rejects a wrong config for a known plugin (no untyped fallback)", () => {
    const wrongType: PluginEntry[] = [
      // @ts-expect-error -- drive must be a string for fake/plugin
      { module: "fake/plugin", config: { drive: 5 } },
    ];
    const typo: PluginEntry[] = [
      // @ts-expect-error -- `drv` is not a fake/plugin config key
      { module: "fake/plugin", config: { drive: "u", drv: 1 } },
    ];
    const thirdParty: PluginEntry[] = [
      // @ts-expect-error -- config needs a PHPluginConfigs augmentation
      { module: "third-party/plugin", config: { anything: 1 } },
    ];
    expect([wrongType, typo, thirdParty]).toHaveLength(3);
  });

  it("checks runner.plugins through @satisfies PHHost, including sibling spreads", () => {
    const base = {
      name: "base",
      runner: {
        module: "fake/runner",
        plugins: [{ module: "fake/plugin", config: { drive: "http://x" } }],
      },
    } satisfies PHHost;
    const derived = {
      name: "derived",
      runner: {
        module: "fake/runner",
        plugins: [...base.runner.plugins, "third-party/plugin"],
      },
    } satisfies PHHost;
    const wrong = {
      name: "wrong",
      runner: {
        module: "fake/runner",
        // @ts-expect-error -- wrong config for a known plugin fails the host
        plugins: [{ module: "fake/plugin", config: { drive: 5 } }],
      },
    } satisfies PHHost;
    expect([derived, wrong]).toHaveLength(2);
  });

  it("types generic compound hosts (host-core augments its own runner)", () => {
    const compound = {
      name: "cli",
      runner: { module: "@powerhousedao/host-core/runners/compound" },
      config: { startOrder: ["cli-switchboard"] },
      children: { "cli-switchboard": { host: "switchboard" } },
    } satisfies PHHost;
    const typo = {
      name: "cli",
      runner: { module: "@powerhousedao/host-core/runners/compound" },
      // @ts-expect-error -- `child` is not a compound host key
      child: {},
    } satisfies PHHost;
    expect([compound, typo]).toHaveLength(2);
  });
});
