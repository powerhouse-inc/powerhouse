import {
  DEFAULT_REGISTRY_URL,
  resolveRegistryConfig,
  type PowerhouseConfig,
} from "@powerhousedao/config";
import { describe, expect, it } from "vitest";

const baseConfig: PowerhouseConfig = {
  logLevel: "info",
  documentModelsDir: "./document-models",
  editorsDir: "./editors",
  processorsDir: "./processors",
  subgraphsDir: "./subgraphs",
  importScriptsDir: "./scripts",
  skipFormat: false,
};

describe("resolveRegistryConfig", () => {
  it("should return undefined registryUrl and empty packages when config has no registry settings", () => {
    const result = resolveRegistryConfig(baseConfig);

    expect(result.registryUrl).toBeUndefined();
    expect(result.packageNames).toEqual([]);
  });

  it("should read registryUrl from config", () => {
    const config: PowerhouseConfig = {
      ...baseConfig,
      registryUrl: DEFAULT_REGISTRY_URL,
    };

    const result = resolveRegistryConfig(config);

    expect(result.registryUrl).toBe(DEFAULT_REGISTRY_URL);
  });

  it("should read registry package names from config", () => {
    const config: PowerhouseConfig = {
      ...baseConfig,
      registryUrl: DEFAULT_REGISTRY_URL,
      packages: [
        {
          packageName: "@powerhousedao/vetra",
          version: "1.0.0",
          provider: "registry",
        },
        {
          packageName: "@powerhousedao/atlas",
          version: "2.0.0",
          provider: "registry",
        },
      ],
    };

    const result = resolveRegistryConfig(config);

    expect(result.packageNames).toEqual([
      "@powerhousedao/vetra",
      "@powerhousedao/atlas",
    ]);
  });

  it("should filter out non-registry packages", () => {
    const config: PowerhouseConfig = {
      ...baseConfig,
      packages: [
        {
          packageName: "@scope/registry-pkg",
          version: "1.0.0",
          provider: "registry",
        },
        {
          packageName: "@scope/npm-pkg",
          version: "1.0.0",
          provider: "npm",
        },
        {
          packageName: "@scope/local-pkg",
          version: "1.0.0",
          provider: "local",
        },
      ],
    };

    const result = resolveRegistryConfig(config);

    expect(result.packageNames).toEqual(["@scope/registry-pkg"]);
  });

  it("should override registryUrl with PH_REGISTRY_URL env var", () => {
    const config: PowerhouseConfig = {
      ...baseConfig,
      registryUrl: "https://config-registry.io/-/cdn/",
    };

    const result = resolveRegistryConfig(config, {
      PH_REGISTRY_URL: "https://env-registry.io/-/cdn/",
    });

    expect(result.registryUrl).toBe("https://env-registry.io/-/cdn/");
  });

  it("should override package names with PH_REGISTRY_PACKAGES env var", () => {
    const config: PowerhouseConfig = {
      ...baseConfig,
      packages: [
        {
          packageName: "@scope/config-pkg",
          version: "1.0.0",
          provider: "registry",
        },
      ],
    };

    const result = resolveRegistryConfig(config, {
      PH_REGISTRY_PACKAGES: "@scope/env-pkg-a, @scope/env-pkg-b",
    });

    expect(result.packageNames).toEqual([
      "@scope/env-pkg-a",
      "@scope/env-pkg-b",
    ]);
  });

  it("should handle PH_REGISTRY_PACKAGES with whitespace", () => {
    const result = resolveRegistryConfig(baseConfig, {
      PH_REGISTRY_PACKAGES: "  @scope/a , @scope/b  ,@scope/c  ",
    });

    expect(result.packageNames).toEqual(["@scope/a", "@scope/b", "@scope/c"]);
  });

  it("should allow env vars to set values even when config has none", () => {
    const result = resolveRegistryConfig(baseConfig, {
      PH_REGISTRY_URL: "https://env-registry.io/-/cdn/",
      PH_REGISTRY_PACKAGES: "@scope/pkg",
    });

    expect(result.registryUrl).toBe("https://env-registry.io/-/cdn/");
    expect(result.packageNames).toEqual(["@scope/pkg"]);
  });

  it("should not override config values when env vars are undefined", () => {
    const config: PowerhouseConfig = {
      ...baseConfig,
      registryUrl: "https://config-registry.io/-/cdn/",
      packages: [
        {
          packageName: "@scope/pkg",
          version: "1.0.0",
          provider: "registry",
        },
      ],
    };

    const result = resolveRegistryConfig(config, {
      PH_REGISTRY_URL: undefined,
      PH_REGISTRY_PACKAGES: undefined,
    });

    expect(result.registryUrl).toBe("https://config-registry.io/-/cdn/");
    expect(result.packageNames).toEqual(["@scope/pkg"]);
  });

  it("should handle empty packages array in config", () => {
    const config: PowerhouseConfig = {
      ...baseConfig,
      packages: [],
    };

    const result = resolveRegistryConfig(config);

    expect(result.packageNames).toEqual([]);
  });

  it("should handle packages with no provider (treated as non-registry)", () => {
    const config: PowerhouseConfig = {
      ...baseConfig,
      packages: [
        {
          packageName: "@scope/no-provider",
          version: "1.0.0",
        },
      ],
    };

    const result = resolveRegistryConfig(config);

    expect(result.packageNames).toEqual([]);
  });
});
