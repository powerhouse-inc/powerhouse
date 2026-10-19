import { describe, expect, it } from "vitest";
import type { PHHost, PHHostOutputs, PluginEntry } from "../src/host-types.js";

// A runner and a plugin package augment the global maps the way real ones
// will (T2); this file only exercises the type level.
declare global {
  interface PHHostRunners {
    "fake/runner": {
      host: { name: string; runner: { module: string; port?: number } };
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
      { module: "fake/plugin", config: { drive: "http://x/d/w" } },
      { module: "third-party/plugin", config: { anything: 1 } },
    ];
    expect(entries).toHaveLength(3);
  });
});
