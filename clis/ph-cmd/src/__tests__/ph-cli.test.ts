import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getPowerhouseProjectInfo = vi.fn();
const injectPnpmAllowBuilds = vi.fn();
const resolveCommand = vi.fn();
const spawnSync = vi.fn();
const getVersion = vi.fn();

vi.mock("@powerhousedao/shared/clis", () => ({
  getPowerhouseProjectInfo,
  injectPnpmAllowBuilds,
}));
vi.mock("package-manager-detector", () => ({ resolveCommand }));
vi.mock("node:child_process", () => ({ spawnSync }));
vi.mock("../get-version.js", () => ({ getVersion }));

const { executePhCliCommand } = await import("../ph-cli.js");

describe("executePhCliCommand", () => {
  const originalArgv = process.argv;

  beforeEach(() => {
    vi.clearAllMocks();
    process.argv = ["node", "ph", "login"];
    getVersion.mockReturnValue("6.2.2-dev.9");
    resolveCommand.mockReturnValue({ command: "npx", args: ["--yes"] });
    spawnSync.mockReturnValue({ status: 0 });
  });

  afterEach(() => {
    process.argv = originalArgv;
  });

  it("dlx-runs an auth command with no project, pinned to the ph-cmd version", async () => {
    getPowerhouseProjectInfo.mockResolvedValue({
      projectPath: undefined,
      packageManager: "npm",
    });

    await executePhCliCommand("login");

    expect(resolveCommand).toHaveBeenCalledWith("npm", "execute", [
      "@powerhousedao/ph-cli@6.2.2-dev.9",
      "login",
    ]);
    expect(injectPnpmAllowBuilds).toHaveBeenCalledOnce();
    expect(spawnSync).toHaveBeenCalledWith(
      "npx",
      ["--yes"],
      expect.objectContaining({ cwd: process.cwd() }),
    );
  });

  it("falls back to the latest tag when the version is unknown", async () => {
    getPowerhouseProjectInfo.mockResolvedValue({
      projectPath: undefined,
      packageManager: "npm",
    });
    getVersion.mockReturnValue("unknown");

    await executePhCliCommand("registry-login");

    expect(resolveCommand).toHaveBeenCalledWith("npm", "execute", [
      "@powerhousedao/ph-cli@latest",
      "registry-login",
    ]);
  });

  it("uses the local install when inside a project", async () => {
    getPowerhouseProjectInfo.mockResolvedValue({
      projectPath: "/repo/my-project",
      packageManager: "pnpm",
    });

    await executePhCliCommand("login");

    expect(resolveCommand).toHaveBeenCalledWith("pnpm", "execute-local", [
      "ph-cli",
      "login",
    ]);
    expect(injectPnpmAllowBuilds).not.toHaveBeenCalled();
    expect(spawnSync).toHaveBeenCalledWith(
      "npx",
      ["--yes"],
      expect.objectContaining({ cwd: "/repo/my-project" }),
    );
  });

  it("still throws for a project-scoped command with no project", async () => {
    getPowerhouseProjectInfo.mockResolvedValue({
      projectPath: undefined,
      packageManager: "npm",
    });

    await expect(executePhCliCommand("generate")).rejects.toThrow(
      /No Powerhouse project directory found/,
    );
    expect(resolveCommand).not.toHaveBeenCalled();
  });

  it("forwards extra args after the command", async () => {
    process.argv = ["node", "ph", "registry-login", "--registry", "https://r"];
    getPowerhouseProjectInfo.mockResolvedValue({
      projectPath: undefined,
      packageManager: "npm",
    });

    await executePhCliCommand("registry-login");

    expect(resolveCommand).toHaveBeenCalledWith("npm", "execute", [
      "@powerhousedao/ph-cli@6.2.2-dev.9",
      "registry-login",
      "--registry",
      "https://r",
    ]);
  });
});
