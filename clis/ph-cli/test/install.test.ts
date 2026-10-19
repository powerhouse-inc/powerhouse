import { DEFAULT_REGISTRY_URL } from "@powerhousedao/config";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

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
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { InstallArgs } from "../src/types.js";

const mockExecSync = vi.mocked(execSync);
const mockGetProjectInfo = vi.mocked(getPowerhouseProjectInfo);
const mockMakeDeps = vi.mocked(makeDependenciesWithVersions);

describe("install", () => {
  const originalEnv = { ...process.env };
  const created: string[] = [];

  // A project on disk: the registry resolution reads powerhouse.config.json
  // itself, so a config source only counts when the file is really there.
  function projectWithConfig(config: Record<string, unknown>): string {
    const dir = mkdtempSync(join(tmpdir(), "ph-install-"));
    created.push(dir);
    writeFileSync(join(dir, "powerhouse.config.json"), JSON.stringify(config));
    mockGetProjectInfo.mockResolvedValue({
      projectPath: dir,
      localProjectPath: dir,
      globalProjectPath: undefined,
      packageManager: "npm",
      isGlobal: false,
    });
    return dir;
  }

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

    mockMakeDeps.mockResolvedValue([
      { name: "@powerhousedao/test-pkg", version: "1.0.0" },
    ]);

    mockExecSync.mockReturnValue(Buffer.from(""));
  });

  afterEach(() => {
    process.env = originalEnv;
    while (created.length > 0) {
      const dir = created.pop();
      if (dir) rmSync(dir, { recursive: true, force: true });
    }
  });

  // `local: true` by default: without it the handler only registers the
  // package in powerhouse.config.json and never runs a package manager.
  async function runInstallHandler(args: {
    dependencies: string[];
    registry?: string;
    debug?: boolean;
    local?: boolean;
  }) {
    const { install } = await import("../src/commands/install.js");
    const handler = install.handler;

    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);

    try {
      await handler({
        local: true,
        allowBuild: [],
        ...args,
      } as unknown as InstallArgs);
    } finally {
      exitSpy.mockRestore();
    }
  }

  // The resolved registry reaches the package manager routed to the scope
  // being installed, so transitive deps stay on the manager's default.
  const routedTo = (url: string) => `--@powerhousedao:registry=${url}`;

  describe("registry resolution", () => {
    it("should use --registry flag over config and env", async () => {
      process.env.PH_REGISTRY_URL = "https://env-registry.io";
      projectWithConfig({ packageRegistryUrl: "https://config-registry.io" });

      await runInstallHandler({
        dependencies: ["@powerhousedao/test-pkg"],
        registry: "https://flag-registry.io",
      });

      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining(routedTo("https://flag-registry.io")),
        expect.anything(),
      );
    });

    it("should use config packageRegistryUrl when no flag provided", async () => {
      projectWithConfig({ packageRegistryUrl: "https://config-registry.io" });

      await runInstallHandler({
        dependencies: ["@powerhousedao/test-pkg"],
      });

      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining(routedTo("https://config-registry.io")),
        expect.anything(),
      );
    });

    it("should use PH_REGISTRY_URL env var when no flag or config", async () => {
      process.env.PH_REGISTRY_URL = "https://env-registry.io";

      await runInstallHandler({
        dependencies: ["@powerhousedao/test-pkg"],
      });

      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining(routedTo("https://env-registry.io")),
        expect.anything(),
      );
    });

    it("should fall back to DEFAULT_REGISTRY_URL when nothing else is set", async () => {
      await runInstallHandler({
        dependencies: ["@powerhousedao/test-pkg"],
      });

      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining(routedTo(DEFAULT_REGISTRY_URL)),
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

    it("should route the scope to the registry in the install command", async () => {
      await runInstallHandler({
        dependencies: ["@powerhousedao/test-pkg"],
        registry: "https://custom-registry.io",
      });

      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining(routedTo("https://custom-registry.io")),
        expect.objectContaining({ cwd: "/test/project" }),
      );
    });
  });

  // A registry CDN serving the package's manifest.
  describe("external dependencies", () => {
    let server: Server;
    let registryUrl: string;
    let manifest: Record<string, unknown>;

    beforeAll(async () => {
      server = createServer((req, res) => {
        if (
          req.url ===
          "/-/cdn/@powerhousedao/test-pkg@1.0.0/powerhouse.manifest.json"
        ) {
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify(manifest));
          return;
        }
        res.statusCode = 404;
        res.end();
      });
      await new Promise<void>((resolve) =>
        server.listen(0, "127.0.0.1", resolve),
      );
      registryUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    });

    afterAll(async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    });

    function warnings() {
      return vi
        .mocked(console.warn)
        .mock.calls.map((parts) => parts.map(String).join(" "));
    }

    beforeEach(() => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
      vi.spyOn(console, "log").mockImplementation(() => {});
      manifest = {
        name: "@powerhousedao/test-pkg",
        externalDependencies: { "native-a": "3.1.4", "native-b": "1.0.0" },
      };
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("warns that subgraphs and processors need a local install", async () => {
      await runInstallHandler({
        dependencies: ["@powerhousedao/test-pkg"],
        registry: registryUrl,
        local: false,
      });

      expect(warnings()).toEqual([
        expect.stringContaining(
          "subgraphs and processors need packages with native addons or WebAssembly modules (native-a, native-b)",
        ),
      ]);
      expect(warnings()[0]).toContain(
        "ph install --local @powerhousedao/test-pkg",
      );
      expect(warnings()[0]).toContain("pieces work either way");
    });

    it("says nothing for a package without external dependencies", async () => {
      manifest = { name: "@powerhousedao/test-pkg" };

      await runInstallHandler({
        dependencies: ["@powerhousedao/test-pkg"],
        registry: registryUrl,
        local: false,
      });

      expect(warnings()).toEqual([]);
    });

    it("says nothing with --local", async () => {
      await runInstallHandler({
        dependencies: ["@powerhousedao/test-pkg"],
        registry: registryUrl,
        local: true,
      });

      expect(warnings()).toEqual([]);
    });
  });
});
