import { DEFAULT_REGISTRY_URL } from "@powerhousedao/config";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("child_process");
vi.mock("@powerhousedao/config/node");
vi.mock("@powerhousedao/common/clis", async (importOriginal) => {
  const actual: Record<string, unknown> = await importOriginal();
  return {
    ...actual,
    getPowerhouseProjectInfo: vi.fn(),
  };
});

import { getPowerhouseProjectInfo } from "@powerhousedao/common/clis";
import { getConfig } from "@powerhousedao/config/node";
import { execSync } from "child_process";
import { getForwardedArgs } from "../src/commands/publish.js";

const mockGetConfig = vi.mocked(getConfig);
const mockExecSync = vi.mocked(execSync);
const mockGetProjectInfo = vi.mocked(getPowerhouseProjectInfo);

describe("publish", () => {
  const originalArgv = process.argv;
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

    // Default: npm whoami succeeds
    mockExecSync.mockReturnValue(Buffer.from("testuser"));
  });

  afterEach(() => {
    process.argv = originalArgv;
    process.env = originalEnv;
  });

  describe("getForwardedArgs", () => {
    it("should return empty array when 'publish' is not in argv", () => {
      process.argv = ["node", "ph"];
      expect(getForwardedArgs()).toEqual([]);
    });

    it("should return empty array when no args after 'publish'", () => {
      process.argv = ["node", "ph", "publish"];
      expect(getForwardedArgs()).toEqual([]);
    });

    it("should forward npm publish args", () => {
      process.argv = [
        "node",
        "ph",
        "publish",
        "--tag",
        "dev",
        "--access",
        "public",
      ];
      expect(getForwardedArgs()).toEqual([
        "--tag",
        "dev",
        "--access",
        "public",
      ]);
    });

    it("should strip --debug flag", () => {
      process.argv = ["node", "ph", "publish", "--debug", "--tag", "dev"];
      expect(getForwardedArgs()).toEqual(["--tag", "dev"]);
    });

    it("should strip --registry and its value", () => {
      process.argv = [
        "node",
        "ph",
        "publish",
        "--registry",
        "http://localhost:8080",
        "--tag",
        "dev",
      ];
      expect(getForwardedArgs()).toEqual(["--tag", "dev"]);
    });

    it("should strip both --debug and --registry", () => {
      process.argv = [
        "node",
        "ph",
        "publish",
        "--debug",
        "--registry",
        "http://localhost:8080",
        "--tag",
        "beta",
      ];
      expect(getForwardedArgs()).toEqual(["--tag", "beta"]);
    });
  });

  describe("handler", () => {
    // We import the handler dynamically to test it after mocks are set up
    async function runPublishHandler(args: {
      registry?: string;
      debug?: boolean;
    }) {
      const { publish } = await import("../src/commands/publish.js");

      // Access the handler from the command object
      const handler = (publish as unknown as { handler: Function }).handler;

      return handler(args);
    }

    it("should use registry URL from args when provided", async () => {
      const exitSpy = vi
        .spyOn(process, "exit")
        .mockImplementation(() => undefined as never);

      await runPublishHandler({
        registry: "http://custom-registry.io",
      });

      // First call is whoami check, second is npm publish
      expect(mockExecSync).toHaveBeenCalledWith(
        "npm whoami --registry http://custom-registry.io",
        { stdio: "pipe" },
      );
      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining(
          "npm publish --registry http://custom-registry.io",
        ),
        expect.objectContaining({ stdio: "inherit", cwd: "/test/project" }),
      );

      exitSpy.mockRestore();
    });

    it("should use registry URL from config when no flag provided", async () => {
      const exitSpy = vi
        .spyOn(process, "exit")
        .mockImplementation(() => undefined as never);

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

      await runPublishHandler({});

      expect(mockExecSync).toHaveBeenCalledWith(
        "npm whoami --registry https://config-registry.io",
        { stdio: "pipe" },
      );

      exitSpy.mockRestore();
    });

    it("should use PH_REGISTRY_URL env var when no flag or config", async () => {
      const exitSpy = vi
        .spyOn(process, "exit")
        .mockImplementation(() => undefined as never);

      process.env.PH_REGISTRY_URL = "https://env-registry.io";

      await runPublishHandler({});

      expect(mockExecSync).toHaveBeenCalledWith(
        "npm whoami --registry https://env-registry.io",
        { stdio: "pipe" },
      );

      exitSpy.mockRestore();
    });

    it("should fall back to DEFAULT_REGISTRY_URL when nothing else is set", async () => {
      const exitSpy = vi
        .spyOn(process, "exit")
        .mockImplementation(() => undefined as never);

      await runPublishHandler({});

      expect(mockExecSync).toHaveBeenCalledWith(
        `npm whoami --registry ${DEFAULT_REGISTRY_URL}`,
        { stdio: "pipe" },
      );

      exitSpy.mockRestore();
    });

    it("should exit with error when not authenticated", async () => {
      const exitError = new Error("process.exit");
      const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
        throw exitError;
      });
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      // Make npm whoami fail
      mockExecSync.mockImplementation((cmd) => {
        if (typeof cmd === "string" && cmd.includes("npm whoami")) {
          throw new Error("ENEEDAUTH");
        }
        return Buffer.from("");
      });

      await expect(runPublishHandler({})).rejects.toThrow("process.exit");

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining("Not authenticated with registry"),
      );
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining("npm adduser --registry"),
      );
      expect(exitSpy).toHaveBeenCalledWith(1);

      // npm publish should NOT have been called
      expect(mockExecSync).not.toHaveBeenCalledWith(
        expect.stringContaining("npm publish"),
        expect.anything(),
      );

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

    it("should run npm publish with correct cwd", async () => {
      const exitSpy = vi
        .spyOn(process, "exit")
        .mockImplementation(() => undefined as never);

      await runPublishHandler({});

      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining("npm publish"),
        expect.objectContaining({ cwd: "/test/project" }),
      );

      exitSpy.mockRestore();
    });

    it("should prioritize registry flag over config and env", async () => {
      const exitSpy = vi
        .spyOn(process, "exit")
        .mockImplementation(() => undefined as never);

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

      await runPublishHandler({
        registry: "https://flag-registry.io",
      });

      expect(mockExecSync).toHaveBeenCalledWith(
        "npm whoami --registry https://flag-registry.io",
        { stdio: "pipe" },
      );

      exitSpy.mockRestore();
    });
  });
});
