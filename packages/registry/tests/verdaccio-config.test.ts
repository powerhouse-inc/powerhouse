import { describe, expect, it } from "vitest";
import type { RegistryConfig } from "../src/types.js";
import { buildVerdaccioConfig } from "../src/verdaccio-config.js";

type VerdaccioConfig = ReturnType<typeof buildVerdaccioConfig> & {
  uplinks: Record<string, { url: string; maxage: string }>;
  packages: Record<string, { proxy?: string }>;
};

function baseConfig(overrides: Partial<RegistryConfig> = {}): RegistryConfig {
  return {
    port: 8080,
    storagePath: "/tmp/storage",
    cdnCachePath: "/tmp/cdn-cache",
    ...overrides,
  };
}

describe("buildVerdaccioConfig", () => {
  it("defaults uplink to public npm", () => {
    const cfg = buildVerdaccioConfig(baseConfig()) as VerdaccioConfig;

    expect(cfg.uplinks.npmjs).toBeDefined();
    expect(cfg.uplinks.npmjs.url).toBe("https://registry.npmjs.org/");
  });

  it("uses the configured uplink URL when provided", () => {
    const cfg = buildVerdaccioConfig(
      baseConfig({ uplink: "https://custom.example/registry/" }),
    ) as VerdaccioConfig;

    expect(cfg.uplinks.npmjs.url).toBe("https://custom.example/registry/");
  });

  it("proxies the catch-all '**' pattern through the npmjs uplink", () => {
    const cfg = buildVerdaccioConfig(baseConfig()) as VerdaccioConfig;

    expect(cfg.packages["**"].proxy).toBe("npmjs");
  });

  it("also proxies @powerhousedao/* through the npmjs uplink", () => {
    const cfg = buildVerdaccioConfig(baseConfig()) as VerdaccioConfig;

    expect(cfg.packages["@powerhousedao/*"].proxy).toBe("npmjs");
  });

  it("defaults the uplink maxage to 2m (matching verdaccio's own default)", () => {
    const cfg = buildVerdaccioConfig(baseConfig()) as VerdaccioConfig;

    expect(cfg.uplinks.npmjs.maxage).toBe("2m");
  });

  it("honors a custom uplinkMaxage value", () => {
    const cfg = buildVerdaccioConfig(
      baseConfig({ uplinkMaxage: "30s" }),
    ) as VerdaccioConfig;

    expect(cfg.uplinks.npmjs.maxage).toBe("30s");
  });
});
