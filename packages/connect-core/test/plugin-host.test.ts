import type { PHConnectRuntimeConfig } from "@powerhousedao/shared/clis";
import { describe, expect, it, vi } from "vitest";
import {
  applyComposition,
  registerConnectPlugins,
} from "../src/plugins/plugin-host.js";

const served = () =>
  ({
    branding: { appName: "Served" },
    ai: { assistantEnabled: true },
  }) as unknown as PHConnectRuntimeConfig;

// A host plugin owning branding.appName, loaded only when a composition applies.
const load = vi.fn(() =>
  Promise.resolve({
    "@acme/branding": {
      create: (config: Record<string, unknown>) => ({
        name: "acme-branding",
        appliesTo: "connect" as const,
        hooks: {
          transformConnectConfig: (cfg: PHConnectRuntimeConfig) => ({
            ...cfg,
            branding: { ...cfg.branding, appName: String(config.appName) },
          }),
        },
      }),
      whenAbsent: (cfg: PHConnectRuntimeConfig) => ({
        ...cfg,
        branding: { ...cfg.branding, appName: "Absent" },
      }),
    },
  }),
);
registerConnectPlugins(load);

describe("the plugin host", () => {
  it("leaves a config without a composition alone, loading no plugins", async () => {
    const config = served();
    expect(await applyComposition(config)).toBe(config);
    expect(load).not.toHaveBeenCalled();
  });

  it("runs a registered plugin the composition names, with its entry config", async () => {
    const config = served();
    config.composition = [
      { module: "@acme/branding", config: { appName: "Acme" } },
    ];
    const out = await applyComposition(config);
    expect(out.branding?.appName).toBe("Acme");
    expect(load).toHaveBeenCalledOnce();
  });

  it("zeroes the slice of a known plugin the composition leaves out", async () => {
    const config = served();
    config.composition = [{ module: "@acme/unknown" }];
    const out = await applyComposition(config);
    expect(out.branding?.appName).toBe("Absent");
    expect(out.ai?.assistantEnabled).toBe(true);
  });
});
