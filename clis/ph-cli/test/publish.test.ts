import { DEFAULT_REGISTRY_URL } from "@powerhousedao/shared/clis";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@powerhousedao/shared/clis", async (importOriginal) => {
  const actual: Record<string, unknown> = await importOriginal();
  return {
    ...actual,
    getPowerhouseProjectInfo: vi.fn(),
  };
});
vi.mock("@powerhousedao/shared/registry", () => ({
  resolveRegistryUrl: vi.fn(),
  checkNpmAuth: vi.fn(),
  npmPublish: vi.fn(),
}));

import { getPowerhouseProjectInfo } from "@powerhousedao/shared/clis";
import {
  checkNpmAuth,
  npmPublish,
  resolveRegistryUrl,
} from "@powerhousedao/shared/registry";

const mockGetProjectInfo = vi.mocked(getPowerhouseProjectInfo);
const mockResolveRegistryUrl = vi.mocked(resolveRegistryUrl);
const mockCheckNpmAuth = vi.mocked(checkNpmAuth);
const mockNpmPublish = vi.mocked(npmPublish);

describe("publish", () => {
  const originalArgv = process.argv;

  beforeEach(() => {
    vi.clearAllMocks();

    mockGetProjectInfo.mockResolvedValue({
      projectPath: "/test/project",
      localProjectPath: "/test/project",
      globalProjectPath: undefined,
      packageManager: "npm",
      isGlobal: false,
    });

    mockResolveRegistryUrl.mockReturnValue(DEFAULT_REGISTRY_URL);
    mockCheckNpmAuth.mockResolvedValue("testuser");
    mockNpmPublish.mockResolvedValue({ stdout: "published" });
  });

  afterEach(() => {
    process.argv = originalArgv;
  });

  async function runPublishHandler(args: {
    registry?: string;
    debug?: boolean;
    forwardedArgs?: string[];
  }) {
    const { publish } = await import("../src/commands/publish.js");
    const handler = publish.handler;

    return handler({ forwardedArgs: [], ...args });
  }

  it("should pass registry flag to resolveRegistryUrl", async () => {
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);

    mockResolveRegistryUrl.mockReturnValue("http://custom-registry.io");

    await runPublishHandler({
      registry: "http://custom-registry.io",
    });

    expect(mockResolveRegistryUrl).toHaveBeenCalledWith({
      registry: "http://custom-registry.io",
      projectPath: "/test/project",
    });
    expect(mockCheckNpmAuth).toHaveBeenCalledWith("http://custom-registry.io");
    expect(mockNpmPublish).toHaveBeenCalledWith({
      registryUrl: "http://custom-registry.io",
      cwd: "/test/project",
      args: [],
    });

    exitSpy.mockRestore();
  });

  it("should use default registry when no flag provided", async () => {
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);

    await runPublishHandler({});

    expect(mockResolveRegistryUrl).toHaveBeenCalledWith({
      registry: undefined,
      projectPath: "/test/project",
    });
    expect(mockCheckNpmAuth).toHaveBeenCalledWith(DEFAULT_REGISTRY_URL);

    exitSpy.mockRestore();
  });

  it("should exit with error when not authenticated", async () => {
    const exitError = new Error("process.exit");
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw exitError;
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    mockCheckNpmAuth.mockRejectedValue(new Error("ENEEDAUTH"));

    await expect(runPublishHandler({})).rejects.toThrow("process.exit");

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Not authenticated with registry"),
    );
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("npm adduser --registry"),
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(mockNpmPublish).not.toHaveBeenCalled();

    exitSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("should throw when project path is not found", async () => {
    mockGetProjectInfo.mockResolvedValue({
      projectPath: undefined,
      localProjectPath: undefined,
      globalProjectPath: undefined,
      packageManager: "npm",
      isGlobal: false,
    });

    await expect(runPublishHandler({})).rejects.toThrow(
      "Could not find project path",
    );
  });

  it("should forward extra args to npmPublish", async () => {
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);

    await runPublishHandler({
      forwardedArgs: ["--tag", "dev"],
    });

    expect(mockNpmPublish).toHaveBeenCalledWith({
      registryUrl: DEFAULT_REGISTRY_URL,
      cwd: "/test/project",
      args: ["--tag", "dev"],
    });

    exitSpy.mockRestore();
  });
});
