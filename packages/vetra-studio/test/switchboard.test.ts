import { describe, expect, it } from "vitest";
import studioSwitchboardPlugin, {
  createStudioSwitchboardPlugin,
} from "../src/switchboard.js";

describe("the studio switchboard plugin", () => {
  it("keeps dev mode on, and hands no login over", () => {
    const plugin = createStudioSwitchboardPlugin();
    expect(plugin.hooks?.transformServerOptions?.({ a: 1 })).toEqual({
      a: 1,
      dev: true,
    });
    // The tab signs in by link at the Connect server (F3d).
    expect(Object.keys(plugin.hooks ?? {})).toEqual(["transformServerOptions"]);
  });

  it("adds the entry's processorConfig to the server's, next to what is there", () => {
    const vetraConfig = {
      interactive: true,
      driveUrl: "http://localhost:4001/d/vetra-1234abcd",
      driveId: "vetra-1234abcd",
    };
    // the default export is a factory: host-core hands it the entry config
    const plugin = studioSwitchboardPlugin({
      processorConfig: { VetraConfig: vetraConfig },
    });
    expect(plugin.name).toBe("vetra-studio-switchboard");
    const transform = plugin.hooks?.transformServerOptions;

    expect(transform?.({ a: 1 })).toEqual({
      a: 1,
      dev: true,
      processorConfig: new Map([["VetraConfig", vetraConfig]]),
    });

    const given = new Map<string, unknown>([["Other", { b: 2 }]]);
    expect(transform?.({ processorConfig: given })).toEqual({
      dev: true,
      processorConfig: new Map<string, unknown>([
        ["Other", { b: 2 }],
        ["VetraConfig", vetraConfig],
      ]),
    });
    // the caller's map is left as it was
    expect([...given.keys()]).toEqual(["Other"]);

    // no config (the entry as scaffolded): options pass with dev mode only
    expect(
      studioSwitchboardPlugin().hooks?.transformServerOptions?.({ a: 1 }),
    ).toEqual({ a: 1, dev: true });
  });
});
