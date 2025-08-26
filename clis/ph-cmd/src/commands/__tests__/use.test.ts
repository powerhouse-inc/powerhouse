import { Command } from "commander";
import * as fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getPackageManagerFromLockfile,
  getProjectInfo,
  type ProjectInfo,
} from "../../utils/index.js";
import { useCommand } from "../use.js";

// Mock dependencies
vi.mock("node:fs");

// Import installDependency after mocking
import {
  installDependency,
  updateDependencyVersionString,
} from "../../utils/index.js";

vi.mock("../../utils/index.js", async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    packageManagers: {
      pnpm: {
        buildAffected: "pnpm run build:affected",
        updateCommand: "pnpm update {{dependency}}",
        installCommand: "pnpm install {{dependency}}",
        workspaceOption: "--workspace-root",
        lockfile: "pnpm-lock.yaml",
      },
    },
    getPackageManagerFromLockfile: vi.fn(),
    getProjectInfo: vi.fn(),
    installDependency: vi.fn(),
    updateDependencyVersionString: vi.fn(),
  } as unknown;
});

describe("useCommand", () => {
  let program: Command;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    program = new Command();
    useCommand(program);

    // Mock utils functions
    vi.mocked(getPackageManagerFromLockfile).mockReturnValue("pnpm");
    vi.mocked(getProjectInfo).mockResolvedValue({
      path: "/test/project",
    } as ProjectInfo);

    // Mock fs.existsSync to return true for test paths and monorepo structure
    vi.spyOn(fs, "existsSync").mockImplementation((p) => {
      const pathStr = p as string;
      const validPaths = [
        "/test/project",
        "/test/project/package.json",
        path.join("/test/project", "package.json"),
        path.join("/test/project", "pnpm-lock.yaml"),
      ];

      // Mock monorepo structure for local path tests
      const isPackagePath = pathStr.includes("/path/to/local/packages/");
      const isAppPath = pathStr.includes("/path/to/local/apps/");
      const isCliPath = pathStr.includes("/path/to/local/clis/");

      return (
        validPaths.includes(pathStr) || isPackagePath || isAppPath || isCliPath
      );
    });

    // Mock fs.readFileSync to return a test package.json
    vi.spyOn(fs, "readFileSync").mockImplementation((p) => {
      if (p === path.join("/test/project", "package.json")) {
        return JSON.stringify({
          dependencies: {
            "@powerhousedao/common": "1.0.0",
            "@powerhousedao/design-system": "1.0.0",
            "@powerhousedao/reactor-browser": "1.0.0",
            "document-model": "1.0.0",
            "document-drive": "1.0.0",
            "some-other-package": "1.0.0",
          },
          devDependencies: {
            "@powerhousedao/builder-tools": "1.0.0",
            "@powerhousedao/codegen": "1.0.0",
          },
        });
      }
      return "";
    });

    // Mock installDependency
    vi.mocked(installDependency).mockImplementation(() => {});
  });

  it("should register the use command with correct options", () => {
    const cmd = program.commands.find((c) => c.name() === "use");
    expect(cmd).toBeDefined();
    expect(cmd?.description()).toContain("change your environment");
    const options = cmd?.options.map((opt) => opt.attributeName());
    expect(options).toContain("packageManager");
    expect(options).toContain("debug");
  });

  it("should execute use command with dev environment", async () => {
    const cmd = program.commands.find((c) => c.name() === "use");
    await cmd?.parseAsync(["node", "test", "dev"]);

    // With dynamic detection, verify it updates the packages found in mock package.json
    expect(updateDependencyVersionString).toHaveBeenCalledWith(
      "pnpm",
      expect.arrayContaining([
        "@powerhousedao/common@dev",
        "@powerhousedao/design-system@dev",
        "@powerhousedao/reactor-browser@dev",
        "@powerhousedao/builder-tools@dev",
        "@powerhousedao/codegen@dev",
        "document-model@dev",
        "document-drive@dev",
      ]),
      "/test/project",
    );
  });

  it("should execute use command with prod environment", async () => {
    const cmd = program.commands.find((c) => c.name() === "use");
    await cmd?.parseAsync(["node", "test", "prod"]);

    expect(updateDependencyVersionString).toHaveBeenCalledWith(
      "pnpm",
      expect.arrayContaining([
        "@powerhousedao/common@latest",
        "@powerhousedao/design-system@latest",
        "@powerhousedao/reactor-browser@latest",
        "@powerhousedao/builder-tools@latest",
        "@powerhousedao/codegen@latest",
        "document-model@latest",
        "document-drive@latest",
      ]),
      "/test/project",
    );
  });

  it("should execute use command with local environment", async () => {
    const cmd = program.commands.find((c) => c.name() === "use");
    await cmd?.parseAsync(["node", "test", "local", "/path/to/local"]);

    expect(installDependency).toHaveBeenCalledWith(
      "pnpm",
      expect.arrayContaining([
        "/path/to/local/packages/common",
        "/path/to/local/packages/design-system",
        "/path/to/local/packages/reactor-browser",
        "/path/to/local/packages/builder-tools",
        "/path/to/local/packages/codegen",
        "/path/to/local/packages/document-model",
        "/path/to/local/packages/document-drive",
      ]),
      "/test/project",
    );
  });

  it("should handle debug flag", async () => {
    const consoleSpy = vi.spyOn(console, "log");
    const cmd = program.commands.find((c) => c.name() === "use");
    await cmd?.parseAsync(["node", "test", "dev", "--debug"]);

    expect(consoleSpy).toHaveBeenCalledWith(">>> options", expect.any(Object));
    expect(consoleSpy).toHaveBeenCalledWith(
      ">>> projectInfo",
      expect.any(Object),
    );
    expect(consoleSpy).toHaveBeenCalledWith(">>> pkgManager", "pnpm");
    expect(consoleSpy).toHaveBeenCalledWith(
      ">>> dependencies to update",
      expect.any(Array),
    );
  });

  it("should throw error when no environment is specified", async () => {
    const cmd = program.commands.find((c) => c.name() === "use");
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((code) => {
      throw new Error(`process.exit called with ${code}`);
    });

    await expect(cmd?.parseAsync(["node", "test"])).rejects.toThrow(
      "process.exit called with 1",
    );

    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("should use specified package manager", async () => {
    const cmd = program.commands.find((c) => c.name() === "use");
    await cmd?.parseAsync(["node", "test", "dev", "--package-manager", "npm"]);

    expect(updateDependencyVersionString).toHaveBeenCalledWith(
      "npm",
      expect.any(Array),
      "/test/project",
    );
  });

  it("should not update dependencies that are not installed", async () => {
    const cmd = program.commands.find((c) => c.name() === "use");
    await cmd?.parseAsync(["node", "test", "dev"]);

    // Verify that only installed dependencies are updated
    const call = vi.mocked(updateDependencyVersionString).mock.calls[0];
    const updatedDependencies = call[1];

    expect(updatedDependencies).not.toContain("@powerhousedao/reactor-api@dev");
    expect(updatedDependencies).not.toContain(
      "@powerhousedao/reactor-local@dev",
    );
    expect(updatedDependencies).not.toContain("@powerhousedao/scalars@dev");
    expect(updatedDependencies).not.toContain("@powerhousedao/ph-cli@dev");
  });

  it("should show message when no Powerhouse dependencies are found", async () => {
    // Mock package.json with no Powerhouse dependencies
    vi.spyOn(fs, "readFileSync").mockImplementation((p) => {
      if (p === path.join("/test/project", "package.json")) {
        return JSON.stringify({
          dependencies: {
            "some-other-package": "1.0.0",
          },
        });
      }
      return "";
    });

    const consoleSpy = vi.spyOn(console, "log");
    const cmd = program.commands.find((c) => c.name() === "use");
    await cmd?.parseAsync(["node", "test", "dev"]);

    expect(consoleSpy).toHaveBeenCalledWith(
      "ℹ️ No Powerhouse dependencies found to update",
    );
    expect(installDependency).not.toHaveBeenCalled();
  });

  it("should handle special packages without @powerhousedao prefix", async () => {
    // Mock package.json with only special packages
    vi.spyOn(fs, "readFileSync").mockImplementation((p) => {
      if (p === path.join("/test/project", "package.json")) {
        return JSON.stringify({
          dependencies: {
            "document-model": "1.0.0",
            "document-drive": "1.0.0",
          },
        });
      }
      return "";
    });

    const cmd = program.commands.find((c) => c.name() === "use");
    await cmd?.parseAsync(["node", "test", "dev"]);

    expect(updateDependencyVersionString).toHaveBeenCalledWith(
      "pnpm",
      ["document-model@dev", "document-drive@dev"],
      "/test/project",
    );
  });

  it("should update only existing @powerhousedao dependencies", async () => {
    // Mock package.json with only common and design-system
    vi.spyOn(fs, "readFileSync").mockImplementation((p) => {
      if (p === path.join("/test/project", "package.json")) {
        return JSON.stringify({
          dependencies: {
            "@powerhousedao/common": "1.0.0",
            "@powerhousedao/design-system": "1.0.0",
          },
        });
      }
      return "";
    });

    const cmd = program.commands.find((c) => c.name() === "use");
    await cmd?.parseAsync(["node", "test", "dev"]);

    expect(updateDependencyVersionString).toHaveBeenCalledWith(
      "pnpm",
      ["@powerhousedao/common@dev", "@powerhousedao/design-system@dev"],
      "/test/project",
    );
  });

  it("should update only existing document-model and document-drive without adding @powerhousedao prefix", async () => {
    // Mock package.json with only document-model and document-drive
    vi.spyOn(fs, "readFileSync").mockImplementation((p) => {
      if (p === path.join("/test/project", "package.json")) {
        return JSON.stringify({
          dependencies: {
            "document-model": "1.0.0",
            "document-drive": "1.0.0",
          },
        });
      }
      return "";
    });

    const cmd = program.commands.find((c) => c.name() === "use");
    await cmd?.parseAsync(["node", "test", "dev"]);

    const updatedDependencies = vi.mocked(updateDependencyVersionString).mock
      .calls[0][1];
    expect(updatedDependencies).toEqual([
      "document-model@dev",
      "document-drive@dev",
    ]);
    expect(updatedDependencies).not.toContain(
      "@powerhousedao/document-model@dev",
    );
    expect(updatedDependencies).not.toContain(
      "@powerhousedao/document-drive@dev",
    );
  });

  // New dynamic detection tests
  it("should dynamically detect all @powerhousedao packages except excluded external dependencies", async () => {
    // Mock package.json with various @powerhousedao packages including excluded ones
    vi.spyOn(fs, "readFileSync").mockImplementation((p) => {
      if (p === path.join("/test/project", "package.json")) {
        return JSON.stringify({
          dependencies: {
            "@powerhousedao/common": "1.0.0",
            "@powerhousedao/design-system": "1.0.0",
            "@powerhousedao/document-engineering": "1.27.0", // Should be excluded
            "@powerhousedao/diff-analyzer": "^0.0.0-dev.10", // Should be excluded
            "@powerhousedao/analytics-engine-core": "^0.5.0", // Should be excluded
            "@powerhousedao/new-package": "1.0.0", // Should be included
            "document-model": "1.0.0",
            "some-other-package": "1.0.0", // Should be ignored
          },
        });
      }
      return "";
    });

    const cmd = program.commands.find((c) => c.name() === "use");
    await cmd?.parseAsync(["node", "test", "dev"]);

    const updatedDependencies = vi.mocked(updateDependencyVersionString).mock
      .calls[0][1];

    // Should include detected @powerhousedao packages except excluded ones
    expect(updatedDependencies).toContain("@powerhousedao/common@dev");
    expect(updatedDependencies).toContain("@powerhousedao/design-system@dev");
    expect(updatedDependencies).toContain("@powerhousedao/new-package@dev");
    expect(updatedDependencies).toContain("document-model@dev");

    // Should exclude external dependencies and non-powerhouse packages
    expect(updatedDependencies).not.toContain(
      "@powerhousedao/document-engineering@dev",
    );
    expect(updatedDependencies).not.toContain(
      "@powerhousedao/diff-analyzer@dev",
    );
    expect(updatedDependencies).not.toContain(
      "@powerhousedao/analytics-engine-core@dev",
    );
    expect(updatedDependencies).not.toContain("some-other-package@dev");
  });

  it("should correctly map packages to monorepo directories for local environment", async () => {
    // Mock fs.existsSync to simulate directory structure
    vi.spyOn(fs, "existsSync").mockImplementation((p) => {
      const pathStr = p as string;

      // Simulate directory structure
      if (pathStr === "/path/to/local/packages") return true;
      if (pathStr === "/path/to/local/apps") return true;
      if (pathStr === "/path/to/local/clis") return true;

      // Simulate package.json files
      if (pathStr === "/path/to/local/packages/common/package.json")
        return true;
      if (pathStr === "/path/to/local/apps/connect/package.json") return true;
      if (pathStr === "/path/to/local/clis/ph-cli/package.json") return true;
      if (pathStr === "/path/to/local/packages/document-model/package.json")
        return true;

      // Default paths
      const validPaths = [
        "/test/project",
        "/test/project/package.json",
        path.join("/test/project", "package.json"),
      ];
      return validPaths.includes(pathStr);
    });

    // Mock fs.readdirSync to simulate directory contents
    const mockReaddirSync = vi.spyOn(fs, "readdirSync");
    // @ts-expect-error - Mock implementation for testing purposes
    mockReaddirSync.mockImplementation((p) => {
      const pathStr = p as string;
      if (pathStr === "/path/to/local/packages") {
        return [
          { name: "common", isDirectory: () => true },
          { name: "document-model", isDirectory: () => true },
        ] as fs.Dirent[];
      }
      if (pathStr === "/path/to/local/apps") {
        return [{ name: "connect", isDirectory: () => true }] as fs.Dirent[];
      }
      if (pathStr === "/path/to/local/clis") {
        return [{ name: "ph-cli", isDirectory: () => true }] as fs.Dirent[];
      }
      return [] as fs.Dirent[];
    });

    // Mock package.json with packages from different locations
    vi.spyOn(fs, "readFileSync").mockImplementation((p) => {
      const pathStr = p as string;
      if (pathStr === path.join("/test/project", "package.json")) {
        return JSON.stringify({
          dependencies: {
            "@powerhousedao/common": "1.0.0", // packages/
            "@powerhousedao/connect": "1.0.0", // apps/
            "@powerhousedao/ph-cli": "1.0.0", // clis/
            "document-model": "1.0.0", // packages/
          },
        });
      }
      if (pathStr === "/path/to/local/packages/common/package.json") {
        return JSON.stringify({ name: "@powerhousedao/common" });
      }
      if (pathStr === "/path/to/local/apps/connect/package.json") {
        return JSON.stringify({ name: "@powerhousedao/connect" });
      }
      if (pathStr === "/path/to/local/clis/ph-cli/package.json") {
        return JSON.stringify({ name: "@powerhousedao/ph-cli" });
      }
      if (pathStr === "/path/to/local/packages/document-model/package.json") {
        return JSON.stringify({ name: "document-model" });
      }
      return "";
    });

    const cmd = program.commands.find((c) => c.name() === "use");
    await cmd?.parseAsync(["node", "test", "local", "/path/to/local"]);

    const installedPaths = vi.mocked(installDependency).mock.calls[0][1];

    expect(installedPaths).toContain("/path/to/local/packages/common");
    expect(installedPaths).toContain("/path/to/local/apps/connect");
    expect(installedPaths).toContain("/path/to/local/clis/ph-cli");
    expect(installedPaths).toContain("/path/to/local/packages/document-model");
  });

  it("should handle new @powerhousedao packages not in previous hardcoded list", async () => {
    // Mock package.json with a new fictional @powerhousedao package
    vi.spyOn(fs, "readFileSync").mockImplementation((p) => {
      if (p === path.join("/test/project", "package.json")) {
        return JSON.stringify({
          dependencies: {
            "@powerhousedao/future-package": "1.0.0",
            "@powerhousedao/another-new-one": "2.0.0",
          },
        });
      }
      return "";
    });

    const cmd = program.commands.find((c) => c.name() === "use");
    await cmd?.parseAsync(["node", "test", "dev"]);

    const updatedDependencies = vi.mocked(updateDependencyVersionString).mock
      .calls[0][1];

    expect(updatedDependencies).toContain("@powerhousedao/future-package@dev");
    expect(updatedDependencies).toContain("@powerhousedao/another-new-one@dev");
  });

  it("should handle mixed @powerhousedao and other organization packages", async () => {
    // Mock package.json with packages from different organizations
    vi.spyOn(fs, "readFileSync").mockImplementation((p) => {
      if (p === path.join("/test/project", "package.json")) {
        return JSON.stringify({
          dependencies: {
            "@powerhousedao/common": "1.0.0", // Should be included
            "@other-org/some-package": "1.0.0", // Should be ignored
            "@microsoft/typescript": "1.0.0", // Should be ignored
            "document-model": "1.0.0", // Should be included (special package)
            react: "18.0.0", // Should be ignored
          },
        });
      }
      return "";
    });

    const cmd = program.commands.find((c) => c.name() === "use");
    await cmd?.parseAsync(["node", "test", "dev"]);

    const updatedDependencies = vi.mocked(updateDependencyVersionString).mock
      .calls[0][1];

    expect(updatedDependencies).toContain("@powerhousedao/common@dev");
    expect(updatedDependencies).toContain("document-model@dev");
    expect(updatedDependencies).not.toContain("@other-org/some-package@dev");
    expect(updatedDependencies).not.toContain("@microsoft/typescript@dev");
    expect(updatedDependencies).not.toContain("react@dev");
  });

  it("should handle empty dependencies gracefully", async () => {
    // Mock package.json with no dependencies
    vi.spyOn(fs, "readFileSync").mockImplementation((p) => {
      if (p === path.join("/test/project", "package.json")) {
        return JSON.stringify({});
      }
      return "";
    });

    const consoleSpy = vi.spyOn(console, "log");
    const cmd = program.commands.find((c) => c.name() === "use");
    await cmd?.parseAsync(["node", "test", "dev"]);

    expect(consoleSpy).toHaveBeenCalledWith(
      "ℹ️ No Powerhouse dependencies found to update",
    );
    expect(updateDependencyVersionString).not.toHaveBeenCalled();
  });

  it("should correctly resolve package names that don't match directory names", async () => {
    // Mock fs.readdirSync for directory scanning
    const mockReaddirSync = vi.spyOn(fs, "readdirSync");
    // @ts-expect-error - Mock implementation for testing purposes
    mockReaddirSync.mockImplementation((dirPath) => {
      const pathStr = dirPath as string;
      if (pathStr.endsWith("/path/to/local/packages")) {
        return [
          { name: "common", isDirectory: () => true },
          { name: "renown", isDirectory: () => true }, // Directory name is "renown"
        ] as fs.Dirent[];
      }
      return [] as fs.Dirent[];
    });

    // Mock fs.existsSync for package.json files
    vi.spyOn(fs, "existsSync").mockImplementation((p) => {
      const pathStr = p as string;
      // Mock directory existence
      if (pathStr === "/test/project") return true;
      if (pathStr === "/test/project/package.json") return true;
      if (pathStr === "/path/to/local/packages") return true;
      if (pathStr === "/path/to/local/apps") return false;
      if (pathStr === "/path/to/local/clis") return false;
      // Mock package.json files
      if (pathStr === "/path/to/local/packages/common/package.json")
        return true;
      if (pathStr === "/path/to/local/packages/renown/package.json")
        return true;
      return false;
    });

    // Mock fs.readFileSync for package.json content
    vi.spyOn(fs, "readFileSync").mockImplementation((p) => {
      const pathStr = p as string;
      if (pathStr === path.join("/test/project", "package.json")) {
        return JSON.stringify({
          dependencies: {
            "@powerhousedao/common": "1.0.0",
            "@renown/sdk": "1.0.0", // Package name is @renown/sdk
          },
        });
      }
      if (pathStr === "/path/to/local/packages/common/package.json") {
        return JSON.stringify({ name: "@powerhousedao/common" });
      }
      if (pathStr === "/path/to/local/packages/renown/package.json") {
        return JSON.stringify({ name: "@renown/sdk" }); // Package name differs from directory
      }
      return "";
    });

    const cmd = program.commands.find((c) => c.name() === "use");
    await cmd?.parseAsync(["node", "test", "local", "/path/to/local"]);

    const installedPaths = vi.mocked(installDependency).mock.calls[0][1];

    // Should find @powerhousedao/common in packages/common/
    expect(installedPaths).toContain("/path/to/local/packages/common");

    // Should find @renown/sdk in packages/renown/ (not packages/sdk/)
    expect(installedPaths).toContain("/path/to/local/packages/renown");
  });
});
