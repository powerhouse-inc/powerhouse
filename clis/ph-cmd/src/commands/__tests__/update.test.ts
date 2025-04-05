import { Command } from "commander";
import * as childProcess from "node:child_process";
import * as fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  findContainerDirectory,
  getPackageManagerFromLockfile,
  getProjectInfo,
  type ProjectInfo,
} from "../../utils.js";
import { updateCommand } from "../update.js";

// Mock dependencies
vi.mock("node:fs");
vi.mock("node:child_process");

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
  findContainerDirectory: vi.fn(),
  installDependency: vi.fn(),
}));

describe("updateCommand", () => {
  let program: Command;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    program = new Command();
    updateCommand(program);

    // Mock utils functions
    vi.mocked(getPackageManagerFromLockfile).mockReturnValue("pnpm");
    vi.mocked(getProjectInfo).mockReturnValue({
      path: "/test/project",
    } as ProjectInfo);
    vi.mocked(findContainerDirectory).mockReturnValue(
      "/user/powerhouse/monorepo",
    );

    // Mock fs.readFileSync for package.json
    vi.mocked(fs.readFileSync).mockImplementation((filePath) => {
      if (filePath === path.join("/test/project", "package.json")) {
        return JSON.stringify({
          dependencies: {
            "@powerhousedao/builder-tools":
              "link:/user/powerhouse/monorepo/packages/builder-tools",
          },
        });
      }
      throw new Error(`Unexpected file read: ${String(filePath)}`);
    });

    // Mock fs.existsSync to return true for test paths
    vi.spyOn(fs, "existsSync").mockImplementation((p) => {
      const validPaths = [
        "/test/project",
        "/user/powerhouse/monorepo",
        "/test/project/package.json",
        path.join("/test/project", "package.json"),
        path.join("/test/project", "pnpm-lock.yaml"),
      ];
      return validPaths.includes(p as string);
    });

    // Mock execSync
    vi.mocked(childProcess.execSync).mockReturnValue(Buffer.from(""));

    // Mock installDependency
    vi.mocked(installDependency).mockImplementation(() => {});
  });

  it("should register the update command with correct options", () => {
    const cmd = program.commands.find((c) => c.name() === "update");
    expect(cmd).toBeDefined();
    expect(cmd?.description()).toContain("update your dependencies");
    // Get options from the command definition, not from parsed args
    const options = cmd?.options.map((opt) => opt.attributeName());
    expect(options).toContain("force");
    expect(options).toContain("packageManager");
    expect(options).toContain("debug");
  });

  it("should execute update command with local dependencies", async () => {
    const cmd = program.commands.find((c) => c.name() === "update");
    await cmd?.parseAsync(["node", "test"]);

    expect(childProcess.execSync).toHaveBeenCalledWith(
      "pnpm run build:affected",
      expect.objectContaining({
        stdio: "inherit",
        cwd: "/user/powerhouse/monorepo",
      }),
    );
  });

  it("should execute update command with force flag", async () => {
    // Mock fs.readFileSync for the specific package.json read in this test
    vi.mocked(fs.readFileSync).mockImplementation((filePath) => {
      if (filePath === path.join("/test/project", "package.json")) {
        return JSON.stringify({
          dependencies: {},
          devDependencies: {},
        });
      }
      throw new Error(`Unexpected file read: ${String(filePath)}`);
    });

    // Mock fs.existsSync to return true for test paths
    vi.spyOn(fs, "existsSync").mockImplementation((p) => {
      const validPaths = [
        "/test/project",
        "/user/powerhouse/monorepo",
        "/test/project/package.json",
        path.join("/test/project", "package.json"),
        path.join("/test/project", "pnpm-lock.yaml"),
      ];
      return validPaths.includes(p as string);
    });

    const cmd = program.commands.find((c) => c.name() === "update");
    await cmd?.parseAsync(["node", "test", "--force", "prod"]);

    // When using --force, it should call installDependency with the latest versions
    expect(installDependency).toHaveBeenCalledWith(
      "pnpm",
      [
        "@powerhousedao/common@latest",
        "@powerhousedao/design-system@latest",
        "@powerhousedao/reactor-browser@latest",
        "@powerhousedao/builder-tools@latest",
        "@powerhousedao/codegen@latest",
        "@powerhousedao/reactor-api@latest",
        "@powerhousedao/reactor-local@latest",
        "@powerhousedao/scalars@latest",
        "@powerhousedao/ph-cli@latest",
      ],
      "/test/project",
    );
  });

  it("should handle debug flag", async () => {
    const consoleSpy = vi.spyOn(console, "log");
    const cmd = program.commands.find((c) => c.name() === "update");
    await cmd?.parseAsync(["node", "test", "--debug"]);

    expect(consoleSpy).toHaveBeenCalledWith(">>> options", expect.any(Object));
  });

  it("should execute update command without local dependencies", async () => {
    // Mock fs.readFileSync to return package.json without local dependencies
    vi.mocked(fs.readFileSync).mockImplementation((filePath) => {
      if (filePath === path.join("/test/project", "package.json")) {
        return JSON.stringify({
          dependencies: {
            "@powerhousedao/builder-tools": "^0.40.0",
            "@powerhousedao/common": "^0.40.0",
          },
        });
      }
      throw new Error(`Unexpected file read: ${String(filePath)}`);
    });

    const cmd = program.commands.find((c) => c.name() === "update");
    await cmd?.parseAsync(["node", "test"]);

    // Should call execSync with pnpm update for all dependencies
    expect(childProcess.execSync).toHaveBeenCalledWith(
      "pnpm update @powerhousedao/common @powerhousedao/design-system @powerhousedao/reactor-browser @powerhousedao/builder-tools @powerhousedao/codegen @powerhousedao/reactor-api @powerhousedao/reactor-local @powerhousedao/scalars @powerhousedao/ph-cli",
      expect.objectContaining({
        stdio: "inherit",
        cwd: "/test/project",
      }),
    );
  });
});
