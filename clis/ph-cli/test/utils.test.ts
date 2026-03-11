import { DEFAULT_REGISTRY_URL } from "@powerhousedao/config";
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  POWERHOUSE_CONFIG_FILE,
  removeStylesImports,
  updateConfigFile,
  updatePackagesArray,
  updateStylesFile,
} from "../src/utils.js";

describe("updatePackagesArray", () => {
  it("should add packages with provider 'registry' on install", () => {
    const result = updatePackagesArray(
      [],
      [{ name: "@scope/pkg", version: "1.0.0" }],
      "install",
    );

    expect(result).toEqual([
      {
        packageName: "@scope/pkg",
        version: "1.0.0",
        provider: "registry",
      },
    ]);
  });

  it("should add multiple packages on install", () => {
    const result = updatePackagesArray(
      [],
      [
        { name: "@scope/pkg-a", version: "1.0.0" },
        { name: "@scope/pkg-b", version: "2.0.0" },
      ],
      "install",
    );

    expect(result).toHaveLength(2);
    expect(result).toEqual([
      { packageName: "@scope/pkg-a", version: "1.0.0", provider: "registry" },
      { packageName: "@scope/pkg-b", version: "2.0.0", provider: "registry" },
    ]);
  });

  it("should overwrite existing package on install", () => {
    const existing = [
      {
        packageName: "@scope/pkg",
        version: "1.0.0",
        provider: "registry" as const,
      },
    ];

    const result = updatePackagesArray(
      existing,
      [{ name: "@scope/pkg", version: "2.0.0" }],
      "install",
    );

    expect(result).toHaveLength(1);
    expect(result![0]).toEqual({
      packageName: "@scope/pkg",
      version: "2.0.0",
      provider: "registry",
    });
  });

  it("should preserve other packages when installing a new one", () => {
    const existing = [
      {
        packageName: "@scope/existing",
        version: "1.0.0",
        provider: "npm" as const,
      },
    ];

    const result = updatePackagesArray(
      existing,
      [{ name: "@scope/new-pkg", version: "1.0.0" }],
      "install",
    );

    expect(result).toHaveLength(2);
    expect(result![0]).toEqual({
      packageName: "@scope/existing",
      version: "1.0.0",
      provider: "npm",
    });
    expect(result![1]).toEqual({
      packageName: "@scope/new-pkg",
      version: "1.0.0",
      provider: "registry",
    });
  });

  it("should remove packages on uninstall", () => {
    const existing = [
      {
        packageName: "@scope/pkg-a",
        version: "1.0.0",
        provider: "registry" as const,
      },
      {
        packageName: "@scope/pkg-b",
        version: "2.0.0",
        provider: "registry" as const,
      },
    ];

    const result = updatePackagesArray(
      existing,
      [{ name: "@scope/pkg-a", version: undefined }],
      "uninstall",
    );

    expect(result).toHaveLength(1);
    expect(result![0].packageName).toBe("@scope/pkg-b");
  });

  it("should handle uninstall of non-existent package gracefully", () => {
    const existing = [
      {
        packageName: "@scope/pkg",
        version: "1.0.0",
        provider: "registry" as const,
      },
    ];

    const result = updatePackagesArray(
      existing,
      [{ name: "@scope/not-installed", version: undefined }],
      "uninstall",
    );

    expect(result).toHaveLength(1);
    expect(result![0].packageName).toBe("@scope/pkg");
  });

  it("should handle undefined currentPackages", () => {
    const result = updatePackagesArray(
      undefined,
      [{ name: "@scope/pkg", version: "1.0.0" }],
      "install",
    );

    expect(result).toHaveLength(1);
    expect(result![0].provider).toBe("registry");
  });

  it("should handle package with undefined version", () => {
    const result = updatePackagesArray(
      [],
      [{ name: "@scope/pkg", version: undefined }],
      "install",
    );

    expect(result).toEqual([
      {
        packageName: "@scope/pkg",
        version: undefined,
        provider: "registry",
      },
    ]);
  });
});

describe("updateConfigFile", () => {
  const tmpDir = path.join(process.cwd(), ".tmp-test-config");

  beforeEach(() => {
    fs.mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should create registry entry and set registryUrl on install", () => {
    const config = {
      logLevel: "info",
      documentModelsDir: "./document-models",
      editorsDir: "./editors",
      processorsDir: "./processors",
      subgraphsDir: "./subgraphs",
      importScriptsDir: "./scripts",
      skipFormat: false,
    };
    fs.writeFileSync(
      path.join(tmpDir, POWERHOUSE_CONFIG_FILE),
      JSON.stringify(config),
    );

    updateConfigFile(
      [{ name: "@powerhousedao/vetra", version: "1.0.0" }],
      tmpDir,
      "install",
    );

    const result = JSON.parse(
      fs.readFileSync(path.join(tmpDir, POWERHOUSE_CONFIG_FILE), "utf-8"),
    );

    expect(result.registryUrl).toBe(DEFAULT_REGISTRY_URL);
    expect(result.packages).toEqual([
      {
        packageName: "@powerhousedao/vetra",
        version: "1.0.0",
        provider: "registry",
      },
    ]);
  });

  it("should preserve existing registryUrl on install", () => {
    const customUrl = "https://custom.registry.io/-/cdn/";
    const config = {
      logLevel: "info",
      documentModelsDir: "./document-models",
      editorsDir: "./editors",
      processorsDir: "./processors",
      subgraphsDir: "./subgraphs",
      importScriptsDir: "./scripts",
      skipFormat: false,
      registryUrl: customUrl,
    };
    fs.writeFileSync(
      path.join(tmpDir, POWERHOUSE_CONFIG_FILE),
      JSON.stringify(config),
    );

    updateConfigFile(
      [{ name: "@scope/pkg", version: "1.0.0" }],
      tmpDir,
      "install",
    );

    const result = JSON.parse(
      fs.readFileSync(path.join(tmpDir, POWERHOUSE_CONFIG_FILE), "utf-8"),
    );

    expect(result.registryUrl).toBe(customUrl);
  });

  it("should not set registryUrl on uninstall", () => {
    const config = {
      logLevel: "info",
      documentModelsDir: "./document-models",
      editorsDir: "./editors",
      processorsDir: "./processors",
      subgraphsDir: "./subgraphs",
      importScriptsDir: "./scripts",
      skipFormat: false,
      packages: [
        {
          packageName: "@scope/pkg",
          version: "1.0.0",
          provider: "registry",
        },
      ],
    };
    fs.writeFileSync(
      path.join(tmpDir, POWERHOUSE_CONFIG_FILE),
      JSON.stringify(config),
    );

    updateConfigFile(
      [{ name: "@scope/pkg", version: undefined }],
      tmpDir,
      "uninstall",
    );

    const result = JSON.parse(
      fs.readFileSync(path.join(tmpDir, POWERHOUSE_CONFIG_FILE), "utf-8"),
    );

    expect(result.registryUrl).toBeUndefined();
    expect(result.packages).toEqual([]);
  });

  it("should throw if config file does not exist", () => {
    expect(() =>
      updateConfigFile(
        [{ name: "@scope/pkg", version: "1.0.0" }],
        "/nonexistent/path",
        "install",
      ),
    ).toThrow("powerhouse.config.json file not found");
  });

  it("should preserve existing config fields", () => {
    const config = {
      logLevel: "debug",
      documentModelsDir: "./dm",
      editorsDir: "./ed",
      processorsDir: "./proc",
      subgraphsDir: "./sub",
      importScriptsDir: "./scripts",
      skipFormat: true,
      vetra: { driveId: "test", driveUrl: "http://example.com" },
    };
    fs.writeFileSync(
      path.join(tmpDir, POWERHOUSE_CONFIG_FILE),
      JSON.stringify(config),
    );

    updateConfigFile(
      [{ name: "@scope/pkg", version: "1.0.0" }],
      tmpDir,
      "install",
    );

    const result = JSON.parse(
      fs.readFileSync(path.join(tmpDir, POWERHOUSE_CONFIG_FILE), "utf-8"),
    );

    expect(result.logLevel).toBe("debug");
    expect(result.vetra).toEqual({
      driveId: "test",
      driveUrl: "http://example.com",
    });
    expect(result.packages).toHaveLength(1);
  });

  it("should handle install then uninstall correctly", () => {
    const config = {
      logLevel: "info",
      documentModelsDir: "./document-models",
      editorsDir: "./editors",
      processorsDir: "./processors",
      subgraphsDir: "./subgraphs",
      importScriptsDir: "./scripts",
      skipFormat: false,
    };
    fs.writeFileSync(
      path.join(tmpDir, POWERHOUSE_CONFIG_FILE),
      JSON.stringify(config),
    );

    // Install
    updateConfigFile(
      [{ name: "@scope/pkg", version: "1.0.0" }],
      tmpDir,
      "install",
    );

    let result = JSON.parse(
      fs.readFileSync(path.join(tmpDir, POWERHOUSE_CONFIG_FILE), "utf-8"),
    );
    expect(result.packages).toHaveLength(1);
    expect(result.registryUrl).toBe(DEFAULT_REGISTRY_URL);

    // Uninstall
    updateConfigFile(
      [{ name: "@scope/pkg", version: undefined }],
      tmpDir,
      "uninstall",
    );

    result = JSON.parse(
      fs.readFileSync(path.join(tmpDir, POWERHOUSE_CONFIG_FILE), "utf-8"),
    );
    expect(result.packages).toEqual([]);
    // registryUrl should remain after uninstall
    expect(result.registryUrl).toBe(DEFAULT_REGISTRY_URL);
  });

  it("should preserve legacy npm provider packages when installing new registry package", () => {
    const config = {
      logLevel: "info",
      documentModelsDir: "./document-models",
      editorsDir: "./editors",
      processorsDir: "./processors",
      subgraphsDir: "./subgraphs",
      importScriptsDir: "./scripts",
      skipFormat: false,
      packages: [
        {
          packageName: "@scope/legacy-pkg",
          version: "1.0.0",
          provider: "npm",
        },
      ],
    };
    fs.writeFileSync(
      path.join(tmpDir, POWERHOUSE_CONFIG_FILE),
      JSON.stringify(config),
    );

    updateConfigFile(
      [{ name: "@scope/new-pkg", version: "2.0.0" }],
      tmpDir,
      "install",
    );

    const result = JSON.parse(
      fs.readFileSync(path.join(tmpDir, POWERHOUSE_CONFIG_FILE), "utf-8"),
    );

    expect(result.packages).toHaveLength(2);
    expect(result.packages[0]).toEqual({
      packageName: "@scope/legacy-pkg",
      version: "1.0.0",
      provider: "npm",
    });
    expect(result.packages[1]).toEqual({
      packageName: "@scope/new-pkg",
      version: "2.0.0",
      provider: "registry",
    });
  });
});
