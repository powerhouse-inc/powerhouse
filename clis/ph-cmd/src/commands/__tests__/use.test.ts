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
    vi.mocked(getProjectInfo).mockReturnValue({
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

    // Mock installDependency
    vi.mocked(installDependency).mockImplementation(() => {});
  });

  it("should register the use command with correct options", () => {
    const cmd = program.commands.find((c) => c.name() === "use");
    expect(cmd).toBeDefined();
    expect(cmd?.description()).toContain("change your environment");
    const options = cmd?.options.map((opt) => opt.attributeName());
    expect(options).toContain("dev");
    expect(options).toContain("prod");
    expect(options).toContain("latest");
    expect(options).toContain("local");
    expect(options).toContain("packageManager");
    expect(options).toContain("debug");
  });

  it("should execute use command with dev environment", async () => {
    const cmd = program.commands.find((c) => c.name() === "use");
    await cmd?.parseAsync(["node", "test", "--dev"]);

    expect(installDependency).toHaveBeenCalledWith(
      "pnpm",
      [
        "@powerhousedao/common@dev",
        "@powerhousedao/design-system@dev",
        "@powerhousedao/reactor-browser@dev",
        "@powerhousedao/builder-tools@dev",
        "@powerhousedao/codegen@dev",
        "@powerhousedao/reactor-api@dev",
        "@powerhousedao/reactor-local@dev",
        "@powerhousedao/scalars@dev",
        "@powerhousedao/ph-cli@dev",
      ],
      "/test/project",
    );
  });

  it("should execute use command with prod environment", async () => {
    const cmd = program.commands.find((c) => c.name() === "use");
    await cmd?.parseAsync(["node", "test", "--prod"]);

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

  it("should execute use command with local environment", async () => {
    const cmd = program.commands.find((c) => c.name() === "use");
    await cmd?.parseAsync(["node", "test", "--local", "/path/to/local"]);

    expect(installDependency).toHaveBeenCalledWith(
      "pnpm",
      [
        "/path/to/local/packages/common",
        "/path/to/local/packages/design-system",
        "/path/to/local/packages/reactor-browser",
        "/path/to/local/packages/builder-tools",
        "/path/to/local/packages/codegen",
        "/path/to/local/packages/reactor-api",
        "/path/to/local/packages/reactor-local",
        "/path/to/local/packages/scalars",
        "/path/to/local/clis/ph-cli",
      ],
      "/test/project",
    );
  });

  it("should handle debug flag", async () => {
    const consoleSpy = vi.spyOn(console, "log");
    const cmd = program.commands.find((c) => c.name() === "use");
    await cmd?.parseAsync(["node", "test", "--dev", "--debug"]);

    expect(consoleSpy).toHaveBeenCalledWith(">>> options", expect.any(Object));
  });

  it("should throw error when no environment is specified", async () => {
    const cmd = program.commands.find((c) => c.name() === "use");
    await expect(cmd?.parseAsync(["node", "test"])).rejects.toThrow(
      "❌ Please specify an environment",
    );
  });

  it("should use specified package manager", async () => {
    const cmd = program.commands.find((c) => c.name() === "use");
    await cmd?.parseAsync([
      "node",
      "test",
      "--dev",
      "--package-manager",
      "npm",
    ]);

    expect(installDependency).toHaveBeenCalledWith(
      "npm",
      expect.any(Array),
      "/test/project",
    );
  });
});
