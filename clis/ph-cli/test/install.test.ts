import { DEFAULT_REGISTRY_URL } from "@powerhousedao/config";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("child_process");
vi.mock("@powerhousedao/config/node");
vi.mock("@powerhousedao/shared/clis", async (importOriginal) => {
  const actual: Record<string, unknown> = await importOriginal();
  return {
    ...actual,
    getPowerhouseProjectInfo: vi.fn(),
    makeDependenciesWithVersions: vi.fn(),
  };
});
vi.mock("../src/utils.js", async (importOriginal) => {
  const actual: Record<string, unknown> = await importOriginal();
  return {
    ...actual,
    updateConfigFile: vi.fn(),
    updateStylesFile: vi.fn(),
  };
});

import {
  getPowerhouseProjectInfo,
  makeDependenciesWithVersions,
} from "@powerhousedao/shared/clis";
import { getConfig } from "@powerhousedao/config/node";
import { execSync } from "child_process";
import type { InstallArgs } from "../src/types.js";

const mockGetConfig = vi.mocked(getConfig);
const mockExecSync = vi.mocked(execSync);
const mockGetProjectInfo = vi.mocked(getPowerhouseProjectInfo);
const mockMakeDeps = vi.mocked(makeDependenciesWithVersions);

describe("install", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.PH_REGISTRY_URL;

    mockGetProjectInfo.mockResolvedValue({
      projectPath: "/test/project",
      localProjectPath: "/test/project",
      globalProjectPath: undefined,
      packageManager: "npm",
      isGlobal: false,
    });

    mockGetConfig.mockReturnValue({
      logLevel: "info",
      documentModelsDir: "./document-models",
      editorsDir: "./editors",
      processorsDir: "./processors",
      subgraphsDir: "./subgraphs",
      importScriptsDir: "./scripts",
      skipFormat: false,
    });

    mockMakeDeps.mockResolvedValue([
      { name: "@powerhousedao/test-pkg", version: "1.0.0" },
    ]);

    mockExecSync.mockReturnValue(Buffer.from(""));
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  async function runInstallHandler(args: {
    dependencies: string[];
    registry?: string;
    debug?: boolean;
  }) {
    const { install } = await import("../src/commands/install.js");
    const handler = install.handler;

    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);

    try {
      await handler(args as InstallArgs);
    } finally {
      exitSpy.mockRestore();
    }
  }

  describe("registry resolution", () => {
    it("should use --registry flag over config and env", async () => {
      process.env.PH_REGISTRY_URL = "https://env-registry.io";
      mockGetConfig.mockReturnValue({
        logLevel: "info",
        documentModelsDir: "./document-models",
        editorsDir: "./editors",
        processorsDir: "./processors",
        subgraphsDir: "./subgraphs",
        importScriptsDir: "./scripts",
        skipFormat: false,
        packageRegistryUrl: "https://config-registry.io",
      });

      await runInstallHandler({
        dependencies: ["@powerhousedao/test-pkg"],
        registry: "https://flag-registry.io",
      });

      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining("--registry https://flag-registry.io"),
        expect.anything(),
      );
    });

    it("should use config packageRegistryUrl when no flag provided", async () => {
      mockGetConfig.mockReturnValue({
        logLevel: "info",
        documentModelsDir: "./document-models",
        editorsDir: "./editors",
        processorsDir: "./processors",
        subgraphsDir: "./subgraphs",
        importScriptsDir: "./scripts",
        skipFormat: false,
        packageRegistryUrl: "https://config-registry.io",
      });

      await runInstallHandler({
        dependencies: ["@powerhousedao/test-pkg"],
      });

      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining("--registry https://config-registry.io"),
        expect.anything(),
      );
    });

    it("should use PH_REGISTRY_URL env var when no flag or config", async () => {
      process.env.PH_REGISTRY_URL = "https://env-registry.io";

      await runInstallHandler({
        dependencies: ["@powerhousedao/test-pkg"],
      });

      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining("--registry https://env-registry.io"),
        expect.anything(),
      );
    });

    it("should fall back to DEFAULT_REGISTRY_URL when nothing else is set", async () => {
      await runInstallHandler({
        dependencies: ["@powerhousedao/test-pkg"],
      });

      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining(`--registry ${DEFAULT_REGISTRY_URL}`),
        expect.anything(),
      );
    });
  });

  describe("registry URL forwarding", () => {
    it("should pass registry URL to makeDependenciesWithVersions", async () => {
      await runInstallHandler({
        dependencies: ["@powerhousedao/test-pkg"],
        registry: "https://custom-registry.io",
      });

      expect(mockMakeDeps).toHaveBeenCalledWith(
        ["@powerhousedao/test-pkg"],
        "https://custom-registry.io",
      );
    });

    it("should pass --registry to the package manager install command", async () => {
      await runInstallHandler({
        dependencies: ["@powerhousedao/test-pkg"],
        registry: "https://custom-registry.io",
      });

      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining("--registry https://custom-registry.io"),
        expect.objectContaining({ cwd: "/test/project" }),
      );
    });
  });
});
