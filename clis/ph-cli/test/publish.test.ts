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
vi.mock("../src/services/build.js", () => ({
  runPublishCheck: vi.fn(),
}));

import { getPowerhouseProjectInfo } from "@powerhousedao/shared/clis";
import {
  checkNpmAuth,
  npmPublish,
  resolveRegistryUrl,
} from "@powerhousedao/shared/registry";
import type * as buildService from "../src/services/build.js";
import { runPublishCheck } from "../src/services/build.js";

const mockRunPublishCheck = vi.mocked(runPublishCheck);
const mockResolveRegistryUrl = vi.mocked(resolveRegistryUrl);
const mockCheckNpmAuth = vi.mocked(checkNpmAuth);
const mockNpmPublish = vi.mocked(npmPublish);

describe("publish", () => {
  const originalArgv = process.argv;

  beforeEach(() => {
    vi.clearAllMocks();

    mockRunPublishCheck.mockResolvedValue({
      exitCode: 0,
      packageRoot: "/test/project",
      prepackEnvironment: {},
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
    configFile?: string;
    source?: string[];
    warningsAsErrors?: boolean;
    outDir?: string;
  }) {
    const { publish } = await import("../src/commands/publish.js");
    const handler = (
      publish as unknown as { handler: (_args: typeof args) => void }
    ).handler;

    return handler({
      forwardedArgs: [],
      source: [],
      warningsAsErrors: false,
      outDir: "dist",
      ...args,
    });
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

  it("exits with the release check's own code, before any registry request", async () => {
    const exitError = new Error("process.exit");
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw exitError;
    });
    mockRunPublishCheck.mockResolvedValue({
      exitCode: 2,
      packageRoot: "/test/project",
      prepackEnvironment: {},
    });

    await expect(runPublishHandler({})).rejects.toThrow("process.exit");

    expect(exitSpy.mock.calls).toEqual([[2]]);
    expect(mockResolveRegistryUrl).not.toHaveBeenCalled();
    expect(mockCheckNpmAuth).not.toHaveBeenCalled();
    expect(mockNpmPublish).not.toHaveBeenCalled();

    exitSpy.mockRestore();
  });

  it("runs the release check before it resolves the registry or checks credentials", async () => {
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);
    const events: string[] = [];
    mockRunPublishCheck.mockImplementation(() => {
      events.push("check");
      return Promise.resolve({
        exitCode: 0,
        packageRoot: "/test/project",
        prepackEnvironment: {},
      });
    });
    mockResolveRegistryUrl.mockImplementation(() => {
      events.push("registry");
      return DEFAULT_REGISTRY_URL;
    });
    mockCheckNpmAuth.mockImplementation(() => {
      events.push("auth");
      return Promise.resolve("testuser");
    });
    mockNpmPublish.mockImplementation(() => {
      events.push("publish");
      return Promise.resolve({ stdout: "published" });
    });

    await runPublishHandler({});

    expect(events).toEqual(["check", "registry", "auth", "publish"]);
    expect(exitSpy.mock.calls).toEqual([[0]]);

    exitSpy.mockRestore();
  });

  it("publishes the package the release check selected", async () => {
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);
    mockRunPublishCheck.mockResolvedValue({
      exitCode: 0,
      packageRoot: "/test/nested",
      prepackEnvironment: {},
    });

    await runPublishHandler({
      configFile: "/test/nested/powerhouse.config.json",
    });

    expect(mockResolveRegistryUrl).toHaveBeenCalledWith({
      registry: undefined,
      projectPath: "/test/nested",
    });
    expect(mockNpmPublish).toHaveBeenCalledWith(
      expect.objectContaining({ cwd: "/test/nested" }),
    );

    exitSpy.mockRestore();
  });

  it("exits 2 when the release check could not run", async () => {
    const exitError = new Error("process.exit");
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw exitError;
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockRunPublishCheck.mockRejectedValue(
      new Error("Could not find project path."),
    );

    await expect(runPublishHandler({})).rejects.toThrow("process.exit");

    expect(exitSpy.mock.calls).toEqual([[2]]);
    expect(mockNpmPublish).not.toHaveBeenCalled();

    exitSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("rejects outside a Powerhouse project when no --config-file is given", async () => {
    vi.mocked(getPowerhouseProjectInfo).mockResolvedValue({
      projectPath: undefined,
      localProjectPath: undefined,
      globalProjectPath: undefined,
      packageManager: "npm",
      isGlobal: false,
    });
    const { runPublishCheck: realRunPublishCheck } = await vi.importActual<
      typeof buildService
    >("../src/services/build.js");

    await expect(
      realRunPublishCheck({
        registry: undefined,
        configFile: undefined,
        source: [],
        outDir: "dist",
        warningsAsErrors: false,
        debug: false,
        forwardedArgs: [],
      }),
    ).rejects.toThrow("Could not find project path.");
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
