import { Command } from "commander";
import * as fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getPackageManagerFromLockfile,
  getProjectInfo,
  type ProjectInfo,
} from "../../utils.js";
import { useCommand } from "../use.js";

// Mock dependencies
vi.mock("node:fs");

// Import installDependency after mocking
import { installDependency } from "../../utils.js";

vi.mock("../../utils.js", () => ({
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
}));

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

    // Mock fs.existsSync to return true for test paths
    vi.spyOn(fs, "existsSync").mockImplementation((p) => {
      const validPaths = [
        "/test/project",
        "/test/project/package.json",
        path.join("/test/project", "package.json"),
        path.join("/test/project", "pnpm-lock.yaml"),
      ];
      return validPaths.includes(p as string);
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

    expect(installDependency).toHaveBeenCalledWith(
      "pnpm",
      [
        "@powerhousedao/common@dev",
        "@powerhousedao/design-system@dev",
        "@powerhousedao/reactor-browser@dev",
        "@powerhousedao/builder-tools@dev",
        "@powerhousedao/codegen@dev",
        "document-model@dev",
        "document-drive@dev",
      ],
      "/test/project",
    );
  });

  it("should execute use command with prod environment", async () => {
    const cmd = program.commands.find((c) => c.name() === "use");
    await cmd?.parseAsync(["node", "test", "prod"]);

    expect(installDependency).toHaveBeenCalledWith(
      "pnpm",
      [
        "@powerhousedao/common@latest",
        "@powerhousedao/design-system@latest",
        "@powerhousedao/reactor-browser@latest",
        "@powerhousedao/builder-tools@latest",
        "@powerhousedao/codegen@latest",
        "document-model@latest",
        "document-drive@latest",
      ],
      "/test/project",
    );
  });

  it("should execute use command with local environment", async () => {
    const cmd = program.commands.find((c) => c.name() === "use");
    await cmd?.parseAsync(["node", "test", "local", "/path/to/local"]);

    expect(installDependency).toHaveBeenCalledWith(
      "pnpm",
      [
        "/path/to/local/packages/common",
        "/path/to/local/packages/design-system",
        "/path/to/local/packages/reactor-browser",
        "/path/to/local/packages/builder-tools",
        "/path/to/local/packages/codegen",
        "/path/to/local/packages/document-model",
        "/path/to/local/packages/document-drive",
      ],
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

    expect(installDependency).toHaveBeenCalledWith(
      "npm",
      expect.any(Array),
      "/test/project",
    );
  });

  it("should not update dependencies that are not installed", async () => {
    const cmd = program.commands.find((c) => c.name() === "use");
    await cmd?.parseAsync(["node", "test", "dev"]);

    // Verify that only installed dependencies are updated
    const call = vi.mocked(installDependency).mock.calls[0];
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

    expect(installDependency).toHaveBeenCalledWith(
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

    expect(installDependency).toHaveBeenCalledWith(
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

    const updatedDependencies = vi.mocked(installDependency).mock.calls[0][1];
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
});
