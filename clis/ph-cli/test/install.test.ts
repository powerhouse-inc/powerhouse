import { DEFAULT_REGISTRY_URL } from "@powerhousedao/config";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("child_process");
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
import { execSync } from "child_process";
import type { InstallArgs } from "../src/types.js";

const mockExecSync = vi.mocked(execSync);
const mockGetProjectInfo = vi.mocked(getPowerhouseProjectInfo);
const mockMakeDeps = vi.mocked(makeDependenciesWithVersions);

describe("install", () => {
  const originalEnv = { ...process.env };
  let projectPath: string;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.PH_REGISTRY_URL;

    projectPath = mkdtempSync(join(tmpdir(), "ph-install-test-"));
    writeFileSync(join(projectPath, "powerhouse.config.json"), "{}");
    mockGetProjectInfo.mockResolvedValue({
      projectPath,
      localProjectPath: projectPath,
      globalProjectPath: undefined,
      packageManager: "npm",
      isGlobal: false,
    });

    mockMakeDeps.mockResolvedValue([
      { name: "@powerhousedao/test-pkg", version: "1.0.0" },
    ]);

    mockExecSync.mockReturnValue(Buffer.from(""));
  });

  afterEach(() => {
    process.env = originalEnv;
    rmSync(projectPath, { recursive: true, force: true });
  });

  async function runInstallHandler(args: {
    allowBuild?: string[];
    dependencies: string[];
    local?: boolean;
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
      writeFileSync(
        join(projectPath, "powerhouse.config.json"),
        JSON.stringify({ packageRegistryUrl: "https://config-registry.io" }),
      );

      await runInstallHandler({
        dependencies: ["@powerhousedao/test-pkg"],
        registry: "https://flag-registry.io",
      });

      expect(mockMakeDeps).toHaveBeenCalledWith(
        ["@powerhousedao/test-pkg"],
        "https://flag-registry.io",
      );
    });

    it("should use config packageRegistryUrl when no flag provided", async () => {
      writeFileSync(
        join(projectPath, "powerhouse.config.json"),
        JSON.stringify({ packageRegistryUrl: "https://config-registry.io" }),
      );

      await runInstallHandler({
        dependencies: ["@powerhousedao/test-pkg"],
      });

      expect(mockMakeDeps).toHaveBeenCalledWith(
        ["@powerhousedao/test-pkg"],
        "https://config-registry.io",
      );
    });

    it("should use PH_REGISTRY_URL env var when no flag or config", async () => {
      process.env.PH_REGISTRY_URL = "https://env-registry.io";

      await runInstallHandler({
        dependencies: ["@powerhousedao/test-pkg"],
      });

      expect(mockMakeDeps).toHaveBeenCalledWith(
        ["@powerhousedao/test-pkg"],
        "https://env-registry.io",
      );
    });

    it("should fall back to DEFAULT_REGISTRY_URL when nothing else is set", async () => {
      await runInstallHandler({
        dependencies: ["@powerhousedao/test-pkg"],
      });

      expect(mockMakeDeps).toHaveBeenCalledWith(
        ["@powerhousedao/test-pkg"],
        DEFAULT_REGISTRY_URL,
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

    it("should route the package scope to the selected registry for local installs", async () => {
      await runInstallHandler({
        allowBuild: [],
        dependencies: ["@powerhousedao/test-pkg"],
        local: true,
        registry: "https://custom-registry.io",
      });

      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining(
          "--@powerhousedao:registry=https://custom-registry.io",
        ),
        expect.objectContaining({ cwd: projectPath }),
      );
    });
  });
});
